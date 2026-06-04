import Link from "next/link";
import { notFound } from "next/navigation";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { LifecycleControls } from "@/components/merchants/lifecycle-controls";
import { OperatorNotesForm, type OperatorNotesValue } from "@/components/merchants/operator-notes-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocumentTypeLabel } from "@/lib/documents/processing";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getMerchantProfileData } from "@/lib/data/merchant-profile";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "funded" || status === "approved") return "success";
  if (status === "rejected" || status === "inactive") return "destructive";
  if (status === "documents_pending" || status === "underwriting_review" || status === "ai_review") return "warning";
  return "secondary";
}

function getRiskLabel(status: string, missingDocuments: number) {
  if (status === "rejected") return "High risk";
  if (status === "funded") return "Low risk";
  if (missingDocuments > 0) return "Documents needed";
  return "Review in progress";
}

function getFundingProbability(application: any) {
  const metadata = typeof application.metadata === "object" && application.metadata ? (application.metadata as Record<string, unknown>) : {};
  const probability = metadata.funding_probability;
  if (typeof probability === "number") return probability;

  if (application.status === "funded") return 92;
  if (application.status === "approved") return 78;
  if (application.status === "qualified" || application.status === "routed") return 62;
  if (application.status === "documents_pending") return 44;
  return 29;
}

function getOperatorNotes(metadata: Record<string, unknown>): OperatorNotesValue {
  const operatorNotes = typeof metadata.operator_notes === "object" && metadata.operator_notes && !Array.isArray(metadata.operator_notes)
    ? metadata.operator_notes as Record<string, unknown>
    : {};

  return {
    internal: readNote(operatorNotes.internal) || readNote(metadata.internal_notes),
    underwriting: readNote(operatorNotes.underwriting),
    lender: readNote(operatorNotes.lender),
    funding: readNote(operatorNotes.funding)
  };
}

function readNote(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getDocumentMetadata(document: { metadata?: unknown }) {
  return typeof document.metadata === "object" && document.metadata && !Array.isArray(document.metadata)
    ? document.metadata as Record<string, unknown>
    : {};
}

function isArchivedDuplicateDocument(document: { status: string; metadata?: unknown }) {
  const metadata = getDocumentMetadata(document);
  return document.status === "rejected" && metadata.archived_as_duplicate === true;
}

function getSubmissionReadiness(input: {
  application: any;
  documents: Array<{ document_type: string; status: string; file_name?: string | null; file_size?: number | null; metadata?: unknown }>;
  lenderMatches: Array<unknown>;
  aiTasks: Array<{ task_type: string; status: string }>;
}) {
  const metadata = typeof input.application.metadata === "object" && input.application.metadata ? input.application.metadata as Record<string, unknown> : {};
  const timeInBusinessMonths = Number(metadata.time_in_business_months ?? 0);
  const uniqueUploadedStatements = new Set(
    input.documents
      .filter((document) => document.document_type === "bank_statements" && document.status === "uploaded" && !isArchivedDuplicateDocument(document))
      .map((document) => `${document.file_name ?? "unknown"}:${document.file_size ?? 0}`)
  );
  const requestedDocuments = input.documents.filter((document) => document.status === "requested");
  const unresolvedQualification = input.aiTasks.some((task) => task.task_type === "lead_qualification" && task.status !== "completed");
  const warnings = [
    ...(timeInBusinessMonths > 0 && timeInBusinessMonths < 6 ? ["Time in business is below matched lender minimum"] : []),
    ...(input.application.credit_score_range === "unknown" ? ["Credit score is missing"] : []),
    ...(!input.application.website_url ? ["Website is missing"] : []),
    ...(metadata.lender_submission_warnings && typeof metadata.lender_submission_warnings === "object" ? ["Business verification needs founder confirmation"] : []),
    ...(requestedDocuments.length > 0 ? ["Requested document remains incomplete"] : []),
    ...(unresolvedQualification ? ["Lead qualification is not completed"] : [])
  ];
  const blockers = [
    ...(uniqueUploadedStatements.size < 4 ? ["Fewer than four unique bank statements"] : []),
    ...(input.lenderMatches.length === 0 ? ["No lender matches available"] : [])
  ];
  const state = blockers.length > 0 ? "Blocked" : warnings.length > 0 ? "Needs Review" : "Ready";
  const score = Math.max(0, Math.min(100, 92 - warnings.length * 6 - blockers.length * 18));

  return {
    state,
    score,
    warnings,
    blockers,
    uniqueUploadedStatements: uniqueUploadedStatements.size,
    requestedDocuments: requestedDocuments.length
  };
}

function getLiveOperationsChecklist(input: {
  application: any;
  documents: Array<{ status: string }>;
  underwritingReviews: Array<{ status: string }>;
  lenderMatches: Array<{ status: string }>;
  offers: Array<{ status: string }>;
  packageReady: boolean;
}) {
  const uploadedDocuments = input.documents.some((document) => document.status === "uploaded" || document.status === "verified");
  const underwritingComplete =
    input.underwritingReviews.some((review) => review.status === "approved") ||
    ["submitted_to_lender", "routed", "approved", "funded"].includes(input.application.status);
  const lenderMatchComplete = input.lenderMatches.length > 0;
  const lenderSubmitted =
    input.lenderMatches.some((match) => ["submitted", "accepted", "funded"].includes(match.status)) ||
    ["submitted_to_lender", "approved", "funded"].includes(input.application.status);
  const offerReceived = input.offers.some((offer) => ["draft", "presented", "accepted"].includes(offer.status));
  const fundingClosed =
    input.application.status === "funded" ||
    input.lenderMatches.some((match) => match.status === "funded");

  const steps = [
    { label: "Merchant Submitted", complete: Boolean(input.application.submitted_at), detail: "Application received" },
    { label: "Documents Uploaded", complete: uploadedDocuments, detail: uploadedDocuments ? "Secure files received" : "Awaiting merchant upload" },
    { label: "Underwriting Complete", complete: underwritingComplete, detail: underwritingComplete ? "Review complete" : "Founder review required" },
    { label: "Lender Match Complete", complete: lenderMatchComplete, detail: lenderMatchComplete ? `${input.lenderMatches.length} match(es) available` : "No lender matches yet" },
    { label: "Package Ready", complete: input.packageReady, detail: input.packageReady ? "Ready for founder-approved submission" : "Resolve package warnings and blockers" },
    { label: "Lender Submitted", complete: lenderSubmitted, detail: lenderSubmitted ? "Submission recorded" : "No lender submission recorded" },
    { label: "Offer Received", complete: offerReceived, detail: offerReceived ? "Lender offer recorded" : "No offer recorded" },
    { label: "Funding Closed", complete: fundingClosed, detail: fundingClosed ? "Funding recorded as closed" : "Funding not closed" }
  ];
  const currentIndex = steps.findIndex((step) => !step.complete);

  return steps.map((step, index) => ({
    ...step,
    state: step.complete ? "complete" : index === currentIndex ? "current" : "waiting"
  }));
}

function getFounderActionPanel(input: {
  application: any;
  documents: Array<{ document_type: string; status: string; processing_status?: string | null }>;
  underwritingReviews: Array<{ status: string }>;
  lenderMatches: Array<{ lender_id: string }>;
  matchedLenders: Array<{
    id: string;
    company_name: string;
    minimum_time_in_business_months?: number | null;
    min_months_in_business?: number | null;
    minimum_monthly_deposits?: number | null;
    min_monthly_revenue?: number | null;
    criteria_min_revenue?: number | null;
    min_fico?: number | null;
  }>;
  submissionReadiness: ReturnType<typeof getSubmissionReadiness>;
}) {
  const metadata = typeof input.application.metadata === "object" && input.application.metadata
    ? input.application.metadata as Record<string, unknown>
    : {};
  const timeInBusinessMonths = Number(metadata.time_in_business_months ?? 0);
  const requestedDocuments = input.documents
    .filter((document) => document.status === "requested")
    .map((document) => document.document_type.replaceAll("_", " "));
  const pendingStatements = input.documents.filter(
    (document) => document.status === "uploaded" && document.processing_status === "pending"
  ).length;
  const missingItems = [
    ...(input.application.credit_score_range === "unknown" ? ["Credit score confirmation"] : []),
    ...(!input.application.website_url ? ["Website or manual business verification"] : []),
    ...(!input.application.bank_name ? ["Bank name"] : []),
    ...(!input.application.average_daily_balance ? ["Average daily balance"] : []),
    ...(!input.application.ownership_percentage ? ["Ownership percentage"] : []),
    ...requestedDocuments.map((document) => `${document} if required`),
    ...(pendingStatements > 0 ? [`Founder verification of ${pendingStatements} uploaded statement(s)`] : [])
  ];
  const requiredDecisions = [
    ...(timeInBusinessMonths < 6 ? [`Confirm whether ${timeInBusinessMonths} months in business qualifies for an exception`] : []),
    ...(!input.application.website_url ? ["Approve manual business verification or obtain website"] : []),
    ...(input.application.credit_score_range === "unknown" ? ["Confirm credit score range before lender selection"] : []),
    ...(input.underwritingReviews.some((review) => review.status === "needs_information") ? ["Resolve underwriting needs-information review"] : []),
    ...(requestedDocuments.length > 0 ? ["Decide whether processing statements are required"] : [])
  ];
  const lenderAssessments = input.lenderMatches.map((match) => {
    const lender = input.matchedLenders.find((candidate) => candidate.id === match.lender_id);
    if (!lender) return null;
    const minimumMonths = Number(lender.minimum_time_in_business_months ?? lender.min_months_in_business ?? 0);
    const minimumRevenue = Number(
      lender.minimum_monthly_deposits ?? lender.min_monthly_revenue ?? lender.criteria_min_revenue ?? 0
    );
    const blockers = [
      ...(timeInBusinessMonths < minimumMonths ? [`${minimumMonths} months minimum`] : []),
      ...(lender.min_fico !== null && lender.min_fico !== undefined && input.application.credit_score_range === "unknown"
        ? [`FICO ${lender.min_fico}+ confirmation`]
        : []),
      ...(Number(input.application.monthly_deposits) < minimumRevenue ? [`${formatCurrency(minimumRevenue)} monthly deposits`] : []),
      ...(!input.application.website_url ? ["business verification"] : [])
    ];

    return { name: lender.company_name, eligible: blockers.length === 0, blockers };
  }).filter((assessment): assessment is { name: string; eligible: boolean; blockers: string[] } => Boolean(assessment));

  return {
    missingItems,
    requiredDecisions,
    eligibleLenders: lenderAssessments.filter((lender) => lender.eligible),
    conditionalLenders: lenderAssessments.filter((lender) => !lender.eligible),
    readinessPercent: input.submissionReadiness.score
  };
}

export default async function MerchantDetailsPage({ params }: { params: Promise<{ applicationId: string[] }> }) {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  let data;
  const resolvedParams = await params;
  const applicationId = resolvedParams.applicationId.join("/");

  try {
    data = await getMerchantProfileData(applicationId);
  } catch {
    notFound();
  }

  const { application, profile, documents, offers, activities, lenderMatches, matchedLenders, underwritingReviews, aiTasks } = data;
  const missingDocuments = documents.filter((document) => document.status !== "verified").length;
  const fundingProbability = getFundingProbability(application);
  const metadata = typeof application.metadata === "object" && application.metadata ? (application.metadata as Record<string, unknown>) : {};
  const operatorNotes = getOperatorNotes(metadata);
  const insights = typeof metadata.ai_summary === "string" ? metadata.ai_summary : typeof metadata.insights === "string" ? metadata.insights : null;
  const submissionReadiness = getSubmissionReadiness({ application, documents, lenderMatches, aiTasks });
  const liveOperationsChecklist = getLiveOperationsChecklist({
    application,
    documents,
    underwritingReviews,
    lenderMatches,
    offers,
    packageReady: submissionReadiness.state === "Ready"
  });
  const founderActionPanel = getFounderActionPanel({
    application,
    documents,
    underwritingReviews,
    lenderMatches,
    matchedLenders,
    submissionReadiness
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{application.business_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Merchant profile and application lifecycle for funding review.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusTone(application.status)}>{application.status.replaceAll("_", " ")}</Badge>
          <Badge variant={missingDocuments > 0 ? "destructive" : "success"}>
            {missingDocuments > 0 ? `${missingDocuments} missing doc(s)` : "Documents complete"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Business profile summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Industry</p>
                  <p className="text-white">{application.industry}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">State</p>
                  <p className="text-white">{application.state ?? "Unknown"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly deposits</p>
                  <p className="text-white">{formatCurrency(Number(application.monthly_deposits))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Requested amount</p>
                  <p className="text-white">{formatCurrency(Number(application.requested_amount))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Funding purpose</p>
                  <p className="text-white">{application.funding_purpose ?? "Not provided"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bank name</p>
                  <p className="text-white">{application.bank_name ?? "Not provided"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Merchant controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-muted-foreground">Probability</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{fundingProbability}%</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-muted-foreground">Risk status</p>
                  <p className="mt-2 text-xl font-semibold text-white">{getRiskLabel(application.status, missingDocuments)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-muted-foreground">AI tasks</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{aiTasks.length}</p>
                </div>
              </div>
              <div className="mt-4">
                <LifecycleControls applicationId={application.id} currentStatus={application.status} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Founder action panel</CardTitle>
                <Badge variant={founderActionPanel.eligibleLenders.length > 0 ? "success" : "warning"}>
                  Submit readiness {founderActionPanel.readinessPercent}%
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Missing Items</p>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {founderActionPanel.missingItems.map((item) => <p key={item}>{item}</p>)}
                    {founderActionPanel.missingItems.length === 0 ? <p className="text-emerald-100">No missing items.</p> : null}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Required Decisions</p>
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {founderActionPanel.requiredDecisions.map((decision) => <p key={decision}>{decision}</p>)}
                    {founderActionPanel.requiredDecisions.length === 0 ? <p className="text-emerald-100">No founder decisions pending.</p> : null}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Eligible Lenders</p>
                  <Badge variant={founderActionPanel.eligibleLenders.length > 0 ? "success" : "destructive"}>
                    {founderActionPanel.eligibleLenders.length} eligible today
                  </Badge>
                </div>
                {founderActionPanel.eligibleLenders.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {founderActionPanel.eligibleLenders.map((lender) => <Badge key={lender.name} variant="success">{lender.name}</Badge>)}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-red-200">No matched lender is eligible under the currently recorded file criteria.</p>
                )}
                <div className="mt-4 space-y-2">
                  {founderActionPanel.conditionalLenders.map((lender) => (
                    <div key={lender.name} className="flex flex-col gap-1 border-t border-white/10 pt-2 text-sm sm:flex-row sm:justify-between">
                      <span className="font-medium text-white">{lender.name}</span>
                      <span className="text-muted-foreground">{lender.blockers.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Lender submission readiness</CardTitle>
                <Badge
                  variant={
                    submissionReadiness.state === "Ready"
                      ? "success"
                      : submissionReadiness.state === "Blocked"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {submissionReadiness.state}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-muted-foreground">Readiness score</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{submissionReadiness.score}%</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-muted-foreground">Unique statements</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{submissionReadiness.uniqueUploadedStatements}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-muted-foreground">Lender matches</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{lenderMatches.length}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                {submissionReadiness.blockers.map((blocker) => (
                  <p key={blocker} className="text-red-200">{blocker}</p>
                ))}
                {submissionReadiness.warnings.map((warning) => (
                  <p key={warning} className="text-amber-100">{warning}</p>
                ))}
                {submissionReadiness.blockers.length === 0 && submissionReadiness.warnings.length === 0 ? (
                  <p className="text-emerald-100">Package is ready for founder-approved lender submission.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle>Live operations checklist</CardTitle>
                <Badge variant={liveOperationsChecklist.every((step) => step.complete) ? "success" : "warning"}>
                  {liveOperationsChecklist.filter((step) => step.complete).length} of {liveOperationsChecklist.length} complete
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2">
                {liveOperationsChecklist.map((step) => (
                  <div
                    key={step.label}
                    className={`flex min-h-20 items-start gap-3 rounded-lg border p-3 ${
                      step.state === "complete"
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : step.state === "current"
                          ? "border-primary/40 bg-primary/10"
                          : "border-white/10 bg-white/5"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                        step.state === "complete" ? "bg-emerald-400" : step.state === "current" ? "bg-primary" : "bg-white/20"
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{step.label}</p>
                        {step.state === "current" ? <Badge variant="warning">Next</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI-generated insights</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Underwriting intelligence, funding fit signals, and missing requirement observations.</p>
              <p className="mt-4 text-sm leading-6 text-white">{insights ?? "No AI summary has been produced yet for this application."}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Operator notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm leading-6 text-muted-foreground">
                Internal, underwriting, lender, and funding notes for the operations desk. These are never shown to merchants.
              </p>
              <OperatorNotesForm applicationId={application.id} initialNotes={operatorNotes} />
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact & profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Primary contact</p>
                  <p className="text-white">{application.owner_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Owner email</p>
                  <p className="text-white">{application.contact_email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Owner phone</p>
                  <p className="text-white">{application.contact_phone}</p>
                </div>
                {profile ? (
                  <div>
                    <p className="text-sm text-muted-foreground">Profile</p>
                    <p className="text-white">{profile.full_name ?? profile.email}</p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active workflow metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Submitted</span>
                  <span className="text-white">{formatDateTime(application.submitted_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Updated</span>
                  <span className="text-white">{formatDateTime(application.updated_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Requested docs</span>
                  <span className="text-white">{documents.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Funding outcomes and commission tracking</CardTitle>
            </CardHeader>
            <CardContent>
              {offers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No lender-confirmed funding outcome has been logged yet. Final terms are handled directly between lender and merchant.
                </p>
              ) : (
                <div className="space-y-3">
                  {offers.map((offer) => (
                    <div key={offer.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{formatCurrency(Number(offer.amount))}</p>
                        <Badge variant={offer.status === "accepted" ? "success" : offer.status === "declined" ? "destructive" : "secondary"}>
                          {offer.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{offer.repayment_frequency ?? "Lender-reported terms pending"}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Underwriting history</CardTitle>
          </CardHeader>
          <CardContent>
            {underwritingReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No underwriting reviews recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {underwritingReviews.map((review) => (
                  <div key={review.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-white">{review.status.replaceAll("_", " ")}</p>
                      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{formatDateTime(review.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{review.funding_recommendation ?? "No recommendation text available."}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lender routing history</CardTitle>
          </CardHeader>
          <CardContent>
            {lenderMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lender routing activity recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {lenderMatches.map((match) => (
                  <div key={match.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{match.status.replaceAll("_", " ")}</p>
                      <span className="text-xs text-muted-foreground">{formatDateTime(match.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Match score: {match.match_score ?? "N/A"}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Uploaded documents</CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No document records found for this application.</p>
            ) : (
              <div className="space-y-3">
                {documents.map((document) => (
                  <div key={document.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{getDocumentTypeLabel(document.document_type)}</p>
                      <Badge variant={document.status === "verified" ? "success" : document.status === "uploaded" ? "warning" : "secondary"}>
                        {document.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{document.file_name ?? "No file recorded"}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>Bucket: {document.storage_bucket ?? "merchant-documents"}</span>
                      <span>Processing: {document.processing_status ?? "pending"}</span>
                    </div>
                    {document.storage_path ? (
                      <Button asChild variant="outline" size="sm" className="mt-4">
                        <Link href={`/api/documents/${document.id}/signed-url`} target="_blank" rel="noreferrer">
                          View secure file
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No CRM activity has been logged yet.</p>
            ) : (
              <div className="space-y-3">
                {activities.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">{activity.subject}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">{activity.activity_type.replaceAll("_", " ")}</p>
                    {activity.body ? <p className="mt-2 text-sm text-muted-foreground">{activity.body}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(activity.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI task history</CardTitle>
        </CardHeader>
        <CardContent>
          {aiTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI tasks have executed for this application yet.</p>
          ) : (
            <div className="space-y-3">
              {aiTasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{task.task_type.replaceAll("_", " ")}</p>
                    <span className="text-xs text-muted-foreground">{task.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Started: {task.started_at ? formatDateTime(task.started_at) : "pending"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Completed: {task.completed_at ? formatDateTime(task.completed_at) : "pending"}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-right">
        <Link href={{ pathname: "/merchants" }} className="text-sm font-medium text-primary hover:underline">
          Back to merchant pipeline
        </Link>
      </div>
    </div>
  );
}
