import type {
  AiTask,
  BusinessApplication,
  CrmActivity,
  DocumentRecord,
  LenderMatch,
  OutreachLog,
  UnderwritingReview
} from "@operion/shared";
import { productionRepository } from "@/lib/repositories/production";

export type WorkflowTimelineState = "complete" | "active" | "pending" | "failed";

export interface WorkflowTimelineStep {
  key:
    | "intake_received"
    | "docs_uploaded"
    | "underwriting_started"
    | "ai_qualification_complete"
    | "lender_matching_started"
    | "lender_package_sent"
    | "waiting_lender_response"
    | "funded"
    | "declined";
  label: string;
  state: WorkflowTimelineState;
  timestamp: string | null;
  detail: string;
}

export interface ApplicationWorkflowTimeline {
  applicationId: string;
  businessName: string;
  ownerName: string;
  status: string;
  requestedAmount: number;
  currentStage: string;
  completionRate: number;
  lastActivityAt: string;
  steps: WorkflowTimelineStep[];
  routingLogs: string[];
  emailDeliveryLogs: string[];
  documentProcessingLogs: string[];
}

const activeUnderwritingStatuses = ["ai_review", "underwriting_review", "reviewing", "needs_review"];
const postQualificationStatuses = ["qualified", "reviewed", "submitted_to_lender", "routed", "approved", "funded"];
const routedStatuses = ["submitted_to_lender", "routed", "approved", "funded"];
const responseStatuses = ["accepted", "funded", "rejected"];

export async function getApplicationWorkflowTimelines(limit = 12): Promise<ApplicationWorkflowTimeline[]> {
  const applications = await productionRepository.listBusinessApplications(limit);
  const applicationIds = applications.map((application) => application.id);

  const [documents, reviews, aiTasks, lenderMatches, crmActivities, outreachLogs] = await Promise.all([
    productionRepository.listDocuments(750),
    productionRepository.listUnderwritingReviewsForApplications(applicationIds),
    productionRepository.listAiTasksForApplications(applicationIds),
    productionRepository.listLenderMatchesForApplications(applicationIds),
    productionRepository.listCrmActivitiesForApplications(applicationIds),
    productionRepository.listOutreachLogs(750)
  ]);

  return applications.map((application) =>
    buildApplicationWorkflowTimeline({
      application,
      documents: documents.filter((document) => document.business_application_id === application.id),
      reviews: reviews.filter((review) => review.business_application_id === application.id || review.application_id === application.id),
      aiTasks: aiTasks.filter((task) => task.business_application_id === application.id),
      lenderMatches: lenderMatches.filter((match) => match.business_application_id === application.id),
      crmActivities: crmActivities.filter(
        (activity) => activity.business_application_id === application.id || activity.application_id === application.id
      ),
      outreachLogs: outreachLogs.filter((log) => log.business_application_id === application.id)
    })
  );
}

function buildApplicationWorkflowTimeline(input: {
  application: BusinessApplication;
  documents: DocumentRecord[];
  reviews: UnderwritingReview[];
  aiTasks: AiTask[];
  lenderMatches: LenderMatch[];
  crmActivities: CrmActivity[];
  outreachLogs: OutreachLog[];
}): ApplicationWorkflowTimeline {
  const { application, documents, reviews, aiTasks, lenderMatches, crmActivities, outreachLogs } = input;
  const uploadedDocuments = documents.filter((document) => document.status === "uploaded" || document.status === "verified" || Boolean(document.uploaded_at));
  const requestedDocuments = documents.filter((document) => document.status === "requested");
  const completedAiTasks = aiTasks.filter((task) => task.status === "completed");
  const failedAiTasks = aiTasks.filter((task) => task.status === "failed" || task.status === "blocked");
  const activeAiTasks = aiTasks.filter((task) => task.status === "queued" || task.status === "running");
  const submittedMatches = lenderMatches.filter((match) => ["submitted", "accepted", "funded", "rejected"].includes(match.status));
  const responsiveMatches = lenderMatches.filter((match) => responseStatuses.includes(match.status));
  const sentEmails = outreachLogs.filter((log) => isSent(log.status));
  const failedEmails = outreachLogs.filter((log) => (log.status ?? "").toLowerCase().includes("failed"));

  const steps: WorkflowTimelineStep[] = [
    {
      key: "intake_received",
      label: "Intake received",
      state: "complete",
      timestamp: application.submitted_at ?? application.created_at,
      detail: "Merchant funding request captured."
    },
    {
      key: "docs_uploaded",
      label: "Docs uploaded",
      state: uploadedDocuments.length > 0 ? "complete" : requestedDocuments.length > 0 || application.status === "documents_pending" ? "active" : "pending",
      timestamp: newestDate(uploadedDocuments.map((document) => document.uploaded_at ?? document.created_at)),
      detail: uploadedDocuments.length > 0 ? `${uploadedDocuments.length} document(s) uploaded.` : "Awaiting business bank statements."
    },
    {
      key: "underwriting_started",
      label: "Funding review started",
      state: reviews.length > 0 || activeUnderwritingStatuses.concat(postQualificationStatuses).includes(application.status) ? "complete" : "pending",
      timestamp: newestDate(reviews.map((review) => review.created_at)) ?? newestDate(crmActivities.map((activity) => activity.created_at)),
      detail: reviews[0]?.funding_recommendation ?? "Review queue will populate after document and intake checks."
    },
    {
      key: "ai_qualification_complete",
      label: "AI qualification complete",
      state: failedAiTasks.length > 0 ? "failed" : completedAiTasks.length > 0 || postQualificationStatuses.includes(application.status) ? "complete" : activeAiTasks.length > 0 ? "active" : "pending",
      timestamp: newestDate(completedAiTasks.map((task) => task.completed_at ?? task.updated_at)),
      detail:
        failedAiTasks.length > 0
          ? `${failedAiTasks.length} AI task(s) need review.`
          : completedAiTasks.length > 0
            ? `${completedAiTasks.length} AI task(s) completed.`
            : "Waiting for AI qualification output."
    },
    {
      key: "lender_matching_started",
      label: "Lender matching started",
      state: lenderMatches.length > 0 ? "complete" : routedStatuses.includes(application.status) ? "active" : "pending",
      timestamp: newestDate(lenderMatches.map((match) => match.created_at)),
      detail: lenderMatches.length > 0 ? `${lenderMatches.length} lender match record(s).` : "No lender match record yet."
    },
    {
      key: "lender_package_sent",
      label: "Lender package sent",
      state: submittedMatches.length > 0 || sentEmails.length > 0 ? "complete" : lenderMatches.length > 0 ? "active" : "pending",
      timestamp: newestDate(sentEmails.map((log) => log.sent_at ?? log.created_at)) ?? newestDate(submittedMatches.map((match) => match.submitted_at ?? match.updated_at)),
      detail: failedEmails.length > 0 ? `${failedEmails.length} delivery failure(s) require review.` : `${sentEmails.length} outbound lender email(s) logged.`
    },
    {
      key: "waiting_lender_response",
      label: "Waiting lender response",
      state: responsiveMatches.length > 0 || outreachLogs.some((log) => Boolean(log.replied_at)) ? "complete" : submittedMatches.length > 0 || sentEmails.length > 0 ? "active" : "pending",
      timestamp: newestDate(responsiveMatches.map((match) => match.decision_at ?? match.updated_at)) ?? newestDate(outreachLogs.map((log) => log.replied_at)),
      detail: responsiveMatches.length > 0 ? `${responsiveMatches.length} lender response record(s).` : "Awaiting lender desk response."
    },
    {
      key: "funded",
      label: "Funded",
      state: application.status === "funded" ? "complete" : "pending",
      timestamp: application.status === "funded" ? application.updated_at : null,
      detail: "Funded outcome is logged only after lender confirmation."
    },
    {
      key: "declined",
      label: "Declined",
      state: application.status === "rejected" || application.status === "withdrawn" || application.status === "inactive" ? "complete" : "pending",
      timestamp: application.status === "rejected" || application.status === "withdrawn" || application.status === "inactive" ? application.updated_at : null,
      detail: "Decline state is logged when current lender criteria are not met."
    }
  ];

  const currentStage = steps.find((step) => step.state === "active")?.label ?? [...steps].reverse().find((step) => step.state === "complete")?.label ?? "Intake received";
  const completedCount = steps.filter((step) => step.state === "complete").length;
  const dates = [
    application.updated_at,
    ...documents.map((document) => document.updated_at ?? document.created_at),
    ...reviews.map((review) => review.updated_at ?? review.created_at),
    ...aiTasks.map((task) => task.updated_at ?? task.created_at),
    ...lenderMatches.map((match) => match.updated_at ?? match.created_at),
    ...crmActivities.map((activity) => activity.created_at),
    ...outreachLogs.map((log) => log.sent_at ?? log.created_at)
  ].filter(Boolean);

  return {
    applicationId: application.id,
    businessName: application.business_name,
    ownerName: application.owner_name,
    status: application.status,
    requestedAmount: application.requested_amount,
    currentStage,
    completionRate: Math.round((completedCount / steps.length) * 100),
    lastActivityAt: newestDate(dates) ?? application.updated_at,
    steps,
    routingLogs: lenderMatches.slice(0, 4).map((match) => `${match.status.replaceAll("_", " ")} / score ${match.match_score ?? "n/a"}`),
    emailDeliveryLogs: outreachLogs.slice(0, 4).map((log) => `${log.subject ?? "Email"} / ${log.status}`),
    documentProcessingLogs: documents.slice(0, 4).map((document) => `${document.document_type.replaceAll("_", " ")} / ${document.status}`)
  };
}

function isSent(status: string | null) {
  const normalized = (status ?? "").toLowerCase();
  return normalized.includes("sent") || normalized.includes("delivered") || normalized.includes("accepted");
}

function newestDate(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}
