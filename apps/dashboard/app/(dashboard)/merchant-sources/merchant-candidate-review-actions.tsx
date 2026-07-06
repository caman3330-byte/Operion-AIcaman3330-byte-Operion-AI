"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, DownloadCloud, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ReviewCandidate = {
  id: string;
  business_name: string;
  website_url: string;
  industry: string;
  business_phone: string | null;
  business_email: string | null;
  quality_score: number;
  import_review_status: string;
};

export function MerchantCandidateReviewActions({
  pendingCandidates,
  approvedCandidates
}: {
  pendingCandidates: ReviewCandidate[];
  approvedCandidates: ReviewCandidate[];
}) {
  const router = useRouter();
  const [selectedPending, setSelectedPending] = useState<Set<string>>(new Set());
  const [selectedApproved, setSelectedApproved] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPendingIds = useMemo(() => [...selectedPending], [selectedPending]);
  const selectedApprovedIds = useMemo(() => [...selectedApproved], [selectedApproved]);

  function toggle(setter: (value: Set<string>) => void, current: Set<string>, id: string) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function setAllPending(checked: boolean) {
    setSelectedPending(checked ? new Set(pendingCandidates.map((candidate) => candidate.id)) : new Set());
  }

  function setAllApproved(checked: boolean) {
    setSelectedApproved(checked ? new Set(approvedCandidates.map((candidate) => candidate.id)) : new Set());
  }

  function reviewSelected(decision: "approved" | "rejected") {
    if (selectedPendingIds.length === 0) return;
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/acquisition/merchant-candidates/batch-review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidate_ids: selectedPendingIds,
          decision,
          notes: decision === "approved" ? "Founder batch approved for CRM import." : "Founder batch rejected from import queue."
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error?.message ?? "Batch review failed.");
        return;
      }
      setSelectedPending(new Set());
      setMessage(`${payload.updated ?? 0} merchant candidate(s) ${decision.replace("ed", "")}ed.`);
      router.refresh();
    });
  }

  function importApproved(candidateIds: string[]) {
    if (candidateIds.length === 0) return;
    startTransition(async () => {
      setMessage(null);
      const response = await fetch("/api/acquisition/merchant-candidates/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidate_ids: candidateIds })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(payload.error?.message ?? "CRM import failed.");
        return;
      }
      const result = payload.data;
      setSelectedApproved(new Set());
      setMessage(`${result.imported ?? 0} imported, ${result.duplicates ?? 0} duplicate(s), ${result.failed ?? 0} failed.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
        <div>
          <p className="text-sm font-semibold">Founder Review Throughput</p>
          <p className="text-xs text-muted-foreground">
            Select verified merchants, approve or reject them in batches, then explicitly import approved merchants to CRM.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={isPending || selectedPendingIds.length === 0} onClick={() => reviewSelected("approved")}>
            <CheckCircle2 className="h-4 w-4" />
            Approve selected
          </Button>
          <Button size="sm" variant="outline" disabled={isPending || selectedPendingIds.length === 0} onClick={() => reviewSelected("rejected")}>
            <XCircle className="h-4 w-4" />
            Reject selected
          </Button>
          <Button size="sm" variant="secondary" disabled={isPending || approvedCandidates.length === 0} onClick={() => importApproved(selectedApprovedIds.length ? selectedApprovedIds : approvedCandidates.map((candidate) => candidate.id))}>
            <DownloadCloud className="h-4 w-4" />
            {selectedApprovedIds.length ? "Import selected" : "Import all approved"}
          </Button>
        </div>
        {message ? <p className="basis-full text-xs text-primary">{message}</p> : null}
      </div>

      <QueueTable
        title="Pending Founder Review"
        candidates={pendingCandidates}
        selected={selectedPending}
        onToggle={(id) => toggle(setSelectedPending, selectedPending, id)}
        onToggleAll={setAllPending}
        empty="No verified merchants are waiting for founder review."
      />

      <QueueTable
        title="Approved For CRM Import"
        candidates={approvedCandidates}
        selected={selectedApproved}
        onToggle={(id) => toggle(setSelectedApproved, selectedApproved, id)}
        onToggleAll={setAllApproved}
        empty="No founder-approved merchants are waiting for CRM import."
      />
    </div>
  );
}

function QueueTable({
  title,
  candidates,
  selected,
  onToggle,
  onToggleAll,
  empty
}: {
  title: string;
  candidates: ReviewCandidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  empty: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Badge variant={candidates.length > 0 ? "warning" : "outline"}>{candidates.length}</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                aria-label={`Select all ${title}`}
                type="checkbox"
                checked={candidates.length > 0 && selected.size === candidates.length}
                onChange={(event) => onToggleAll(event.currentTarget.checked)}
                className="h-4 w-4 accent-primary"
              />
            </TableHead>
            <TableHead>Merchant</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {candidates.map((candidate) => (
            <TableRow key={candidate.id}>
              <TableCell>
                <input
                  aria-label={`Select ${candidate.business_name}`}
                  type="checkbox"
                  checked={selected.has(candidate.id)}
                  onChange={() => onToggle(candidate.id)}
                  className="h-4 w-4 accent-primary"
                />
              </TableCell>
              <TableCell>
                <div className="max-w-md">
                  <p className="font-medium">{candidate.business_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{candidate.website_url}</p>
                </div>
              </TableCell>
              <TableCell className="capitalize">{candidate.industry.replace(/_/g, " ")}</TableCell>
              <TableCell>{candidate.business_phone ?? "Missing"}</TableCell>
              <TableCell>{candidate.business_email ?? "Not found"}</TableCell>
              <TableCell className="text-right">{candidate.quality_score}</TableCell>
              <TableCell>
                <Badge variant={candidate.import_review_status === "approved" ? "success" : "warning"}>
                  {candidate.import_review_status.replace(/_/g, " ")}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {candidates.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
