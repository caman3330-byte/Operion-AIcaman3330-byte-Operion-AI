"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { BusinessApplicationStatus } from "@operion/shared";
import { ArrowRightCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const statuses: BusinessApplicationStatus[] = [
  "submitted",
  "documents_pending",
  "ai_review",
  "qualified",
  "needs_review",
  "underwriting_review",
  "reviewing",
  "reviewed",
  "submitted_to_lender",
  "routed",
  "approved",
  "funded",
  "rejected",
  "inactive",
  "withdrawn"
];

export function LifecycleControls({
  applicationId,
  currentStatus
}: {
  applicationId: string;
  currentStatus: BusinessApplicationStatus;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<BusinessApplicationStatus>(currentStatus);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitTransition() {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/operations/crm/lifecycle", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            applicationId,
            toStatus: status,
            ...(reason.trim() ? { reason: reason.trim() } : {})
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMessage(payload?.error?.message ?? payload?.data?.error ?? "Unable to update lifecycle.");
          return;
        }
        setMessage("Lifecycle updated and CRM activity recorded.");
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to update lifecycle.");
      }
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="grid gap-3 sm:grid-cols-[0.7fr_1fr]">
        <div className="space-y-1">
          <Label htmlFor="lifecycle-status">Lifecycle status</Label>
          <Select
            id="lifecycle-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as BusinessApplicationStatus)}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="lifecycle-reason">Reason</Label>
          <Textarea
            id="lifecycle-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Operator note for status change"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={isPending || status === currentStatus} onClick={submitTransition}>
          <ArrowRightCircle className="h-4 w-4" />
          Move Status
        </Button>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
    </div>
  );
}
