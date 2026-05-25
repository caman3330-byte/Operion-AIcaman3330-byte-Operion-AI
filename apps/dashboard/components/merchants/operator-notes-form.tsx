"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export type OperatorNotesValue = {
  internal: string;
  underwriting: string;
  lender: string;
  funding: string;
};

type SaveState = {
  status: "idle" | "success" | "error";
  message: string;
};

export function OperatorNotesForm({
  applicationId,
  initialNotes
}: {
  applicationId: string;
  initialNotes: OperatorNotesValue;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle", message: "Notes are stored internally and never shown to merchants." });
  const [isPending, startTransition] = useTransition();

  function updateNote(key: keyof OperatorNotesValue, value: string) {
    setNotes((current) => ({ ...current, [key]: value }));
  }

  function saveNotes() {
    setSaveState({ status: "idle", message: "Saving operator notes..." });
    startTransition(async () => {
      try {
        const response = await fetch("/api/operations/application-notes", {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ applicationId, ...notes })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setSaveState({
            status: "error",
            message: payload?.error?.message ?? payload?.error ?? `Save failed with HTTP ${response.status}`
          });
          return;
        }
        setSaveState({ status: "success", message: "Operator notes saved and activity logged." });
      } catch (error) {
        setSaveState({ status: "error", message: error instanceof Error ? error.message : "Unable to save notes." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <NoteField
          id="internal-notes"
          label="Internal notes"
          value={notes.internal}
          onChange={(value) => updateNote("internal", value)}
          placeholder="Operational context, merchant calls, timing, and desk reminders."
        />
        <NoteField
          id="underwriting-notes"
          label="Underwriting notes"
          value={notes.underwriting}
          onChange={(value) => updateNote("underwriting", value)}
          placeholder="Bank statement observations, risk flags, revenue questions."
        />
        <NoteField
          id="lender-notes"
          label="Lender notes"
          value={notes.lender}
          onChange={(value) => updateNote("lender", value)}
          placeholder="Routing preferences, lender responses, submission packaging."
        />
        <NoteField
          id="funding-notes"
          label="Funding notes"
          value={notes.funding}
          onChange={(value) => updateNote("funding", value)}
          placeholder="Funding outcome, commission follow-up, direct lender handoff."
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/[0.10] bg-black/20 p-3">
        <div>
          <p className="text-sm font-medium text-white">Operator notes</p>
          <p className="mt-1 text-xs text-muted-foreground">{saveState.message}</p>
        </div>
        <div className="flex items-center gap-2">
          {saveState.status !== "idle" ? (
            <Badge variant={saveState.status === "success" ? "success" : "destructive"}>{saveState.status}</Badge>
          ) : null}
          <Button type="button" onClick={saveNotes} disabled={isPending}>
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save notes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NoteField({
  id,
  label,
  value,
  onChange,
  placeholder
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-32 resize-y"
      />
    </div>
  );
}
