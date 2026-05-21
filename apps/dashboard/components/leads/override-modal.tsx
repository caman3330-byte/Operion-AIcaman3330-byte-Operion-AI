"use client";

import { useEffect, useState } from "react";
import type { Lead } from "@operion/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface OverrideModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (lead: Lead) => void;
}

const defaultReason = "Manual override executed from supervisor dashboard.";

export function OverrideModal({ lead, open, onOpenChange, onSuccess }: OverrideModalProps) {
  const [action, setAction] = useState<"override_score" | "blacklist" | "pause_outreach" | "force_archive">("pause_outreach");
  const [reason, setReason] = useState(defaultReason);
  const [score, setScore] = useState(70);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setAction("pause_outreach");
      setReason(defaultReason);
      setScore(70);
      setError(null);
    }
  }, [open]);

  async function handleSubmit() {
    if (!lead) return;
    if ((action === "override_score" || action === "blacklist") && !reason.trim()) {
      setError("Reason is required for score override and blacklist actions.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const payload: Record<string, unknown> = { action, reason: reason.trim() };
      if (action === "override_score") {
        payload.score = score;
      }

      const response = await fetch(`/api/leads/${lead.id}/override`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Override request failed.");
      }

      const { data } = await response.json();
      onSuccess(data as Lead);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to apply override.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual Override</DialogTitle>
          <DialogDescription>
            {lead ? `Record a founder-supervised action for ${lead.business_name}.` : "Select a lead first."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="override-action">Action</Label>
            <Select id="override-action" value={action} onChange={(event) => setAction(event.target.value as any)}>
              <option value="override_score">Override AI score</option>
              <option value="blacklist">Blacklist lead</option>
              <option value="pause_outreach">Pause outreach</option>
              <option value="force_archive">Force archive</option>
            </Select>
          </div>
          {action === "override_score" ? (
            <div className="space-y-2">
              <Label htmlFor="override-score">Score</Label>
              <Input
                id="override-score"
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(event) => setScore(Number(event.target.value))}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="override-reason">Reason</Label>
            <Textarea
              id="override-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Required for score override and blacklist actions."
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!lead || isSubmitting}>
              {isSubmitting ? "Recording…" : "Record Override"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
