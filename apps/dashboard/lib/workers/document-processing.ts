import type { Json } from "@operion/shared";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { productionRepository } from "@/lib/repositories/production";
import { writeAuditLog } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { recordWorkerHeartbeat } from "@/lib/operations/worker-observability";

export interface DocumentProcessingResult {
  processed: number;
  transitioned: number;
  skipped: number;
  failed: number;
  items: Array<{
    task_id: string;
    application_id: string | null;
    document_id: string | null;
    status: "completed" | "failed" | "skipped";
    transition?: string;
    reason?: string;
  }>;
}

const AWAITING_STATUSES = new Set(["awaiting_documents", "documents_pending", "documents_uploaded"]);

export async function runDocumentProcessingWorker(limit = 15): Promise<DocumentProcessingResult> {
  const workerStartedAt = Date.now();
  const result: DocumentProcessingResult = { processed: 0, transitioned: 0, skipped: 0, failed: 0, items: [] };

  // Fetch blocked document_processing tasks — these are documents uploaded
  // but pending OCR/parsing worker (registered as blocked in upload route)
  const { data: tasks, error } = await getSupabaseAdmin()
    .from("ai_tasks")
    .select("*")
    .eq("task_type", "document_processing")
    .eq("status", "blocked")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    logger.error("document_processing_worker_fetch_failed", { error: error.message });
    await recordWorkerHeartbeat({
      workerName: "document_processing_worker",
      department: "underwriting",
      status: "failed",
      queueName: "ai_tasks:document_processing",
      queueSize: 0,
      lastStartedAt: new Date(workerStartedAt).toISOString(),
      lastDurationMs: Date.now() - workerStartedAt,
      errorMessage: error.message
    });
    throw new Error(`Failed to fetch tasks: ${error.message}`);
  }

  const candidates = tasks ?? [];
  logger.info("document_processing_worker_started", { candidates: candidates.length });
  await recordWorkerHeartbeat({
    workerName: "document_processing_worker",
    department: "underwriting",
    status: candidates.length > 0 ? "running" : "idle",
    queueName: "ai_tasks:document_processing",
    queueSize: candidates.length,
    currentTask: candidates[0]?.id ?? null,
    lastStartedAt: new Date(workerStartedAt).toISOString()
  });

  for (const task of candidates) {
    const appId = task.business_application_id;
    const inputPayload = task.input_payload as Record<string, unknown> | null;
    const documentId = String(inputPayload?.document_id ?? "");

    try {
      if (!appId) {
        result.skipped++;
        result.items.push({ task_id: task.id, application_id: null, document_id: documentId || null, status: "skipped", reason: "No business_application_id" });
        continue;
      }

      // Load application
      const app = await productionRepository.getBusinessApplication(appId);
      const appStatus = app.status as string;

      // Determine if we need to transition the application
      let transition: string | undefined;
      if (AWAITING_STATUSES.has(appStatus)) {
        // Check how many documents are uploaded for this app
        const docs = await productionRepository.listDocumentsForApplication(appId);
        const uploaded = docs.filter((d) => d.status === "uploaded" || d.status === "verified");

        if (uploaded.length > 0) {
          // Transition to underwriting_review
          await productionRepository.updateBusinessApplication(appId, {
            status: "underwriting_review" as any,
            metadata: {
              ...(typeof app.metadata === "object" && app.metadata ? app.metadata : {}),
              underwriting_triggered_at: new Date().toISOString(),
              underwriting_trigger: "document_processing_worker",
              documents_uploaded_count: uploaded.length
            } as Json
          });
          transition = `${appStatus} → underwriting_review`;
          result.transitioned++;

          await productionRepository.createCrmActivity({
            application_id: null,
            business_application_id: appId,
            lead_id: task.lead_id ?? app.lead_id,
            actor_id: "document_processing_worker",
            actor_type: "system",
            activity_type: "status_change",
            subject: `Application moved to underwriting review`,
            body: `Document processing worker detected ${uploaded.length} uploaded document(s) and transitioned application from ${appStatus} to underwriting_review.`,
            metadata: { documents_uploaded: uploaded.length, from_status: appStatus, to_status: "underwriting_review" } as Json
          });
        }
      }

      // Mark task completed — the document is acknowledged even if OCR isn't running
      await productionRepository.updateAiTask(task.id, {
        status: "completed",
        completed_at: new Date().toISOString(),
        result_payload: {
          document_id: documentId || null,
          application_id: appId,
          application_status_before: appStatus,
          transition: transition ?? "no_transition_required",
          processed_at: new Date().toISOString(),
          processing_note: "Document acknowledged by processing worker. Full OCR/parsing pending external worker activation."
        } as Json,
        error_message: null
      });

      await productionRepository.createAiTaskLog({
        ai_task_id: task.id,
        status: "completed",
        message: `Document processing acknowledged${transition ? `; application transitioned: ${transition}` : ""}`,
        provider: "document_processing_worker",
        model: null,
        metadata: {
          document_id: documentId || null,
          transition: transition ?? null,
          app_status: appStatus
        } as Json
      });

      await writeAuditLog({
        eventType: "document_processing_acknowledged",
        actorType: "system",
        actorId: "document_processing_worker",
        entityType: "document",
        entityId: documentId || appId,
        metadata: {
          task_id: task.id,
          application_id: appId,
          transition: transition ?? null
        } as Json
      });

      result.processed++;
      result.items.push({
        task_id: task.id,
        application_id: appId,
        document_id: documentId || null,
        status: "completed",
        ...(transition !== undefined ? { transition } : {})
      });

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logger.error("document_processing_task_failed", { task_id: task.id, appId, error: msg });

      try {
        await productionRepository.updateAiTask(task.id, {
          status: "failed",
          error_message: msg,
          completed_at: new Date().toISOString()
        });
        await productionRepository.createAiTaskLog({
          ai_task_id: task.id,
          status: "failed",
          message: `Document processing failed: ${msg}`,
          provider: null,
          model: null,
          metadata: {} as Json
        });
      } catch { /* best effort */ }

      result.failed++;
      result.items.push({
        task_id: task.id,
        application_id: appId ?? null,
        document_id: documentId || null,
        status: "failed",
        reason: msg
      });
    }
  }

  logger.info("document_processing_worker_done", {
    processed: result.processed,
    transitioned: result.transitioned,
    skipped: result.skipped,
    failed: result.failed
  });
  const durationMs = Date.now() - workerStartedAt;
  await recordWorkerHeartbeat({
    workerName: "document_processing_worker",
    department: "underwriting",
    status: result.failed > 0 ? "failed" : "idle",
    queueName: "ai_tasks:document_processing",
    queueSize: Math.max(0, candidates.length - result.processed - result.skipped - result.failed),
    lastCompletedTask: result.items.find((item) => item.status === "completed")?.task_id ?? null,
    lastCompletedAt: new Date().toISOString(),
    averageExecutionMs: result.processed > 0 ? Math.round(durationMs / result.processed) : durationMs,
    lastDurationMs: durationMs,
    errorMessage: result.failed > 0 ? `${result.failed} document processing task(s) failed.` : null,
    metadata: {
      processed: result.processed,
      transitioned: result.transitioned,
      skipped: result.skipped,
      failed: result.failed
    } as Json
  });
  return result;
}
