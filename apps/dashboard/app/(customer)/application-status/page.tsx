import { CheckCircle2, Clock3, FileText, Landmark, UploadCloud } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentUploadForm } from "@/components/application/document-upload-form";
import { getCustomerWorkspaceData } from "@/lib/data/customer-workspace";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ApplicationStatusPage() {
  const workspace = await getCustomerWorkspaceData();
  const application = workspace.applications[0] ?? null;
  const timeline = buildTimeline(application?.status ?? null, application?.created_at ?? null, application?.updated_at ?? null);
  const requiredDocuments = workspace.documents.filter((document) => document.status === "requested").length;

  if (!application) {
    return (
      <div className="space-y-6">
        <div>
          <Badge variant="outline">Application status</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">No active application</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Submit a funding application to create your funding status workspace.
          </p>
        </div>
        <Button asChild>
          <Link href="/apply">Start application</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Badge variant={requiredDocuments > 0 ? "warning" : "success"}>{requiredDocuments > 0 ? "Action needed" : "Current"}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">Application status</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Monitor your funding application, remaining requirements, and lender-readiness status.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-lg border border-white/10 bg-card/80 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Current stage</h2>
            <Clock3 className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-5 text-4xl font-semibold capitalize text-white">{application.status.replaceAll("_", " ")}</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {application.business_name} requested {formatCurrency(Number(application.requested_amount))} for{" "}
            {application.product_type.replaceAll("_", " ")}.
          </p>
          <Button className="mt-6" variant="outline">
            <UploadCloud className="h-4 w-4" />
            Document requests: {requiredDocuments}
          </Button>
        </section>

        <section className="rounded-lg border border-white/10 bg-card/80 p-5">
          <h2 className="font-semibold text-white">Timeline</h2>
          <div className="mt-5 grid gap-4">
            {timeline.map((item) => (
              <div key={item.title} className="flex items-center gap-4 rounded-md border border-white/10 bg-white/[0.035] p-4">
                <span className={item.status === "complete" ? "flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground" : "flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-muted-foreground"}>
                  {item.status === "complete" ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.date}</p>
                </div>
                <Badge variant={item.status === "current" ? "warning" : item.status === "complete" ? "success" : "secondary"}>
                  {item.status}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-white/10 bg-card/80 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Recent activity</h2>
            <p className="mt-1 text-sm text-muted-foreground">AI-generated activity, lender updates, and customer interactions for this application.</p>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          {workspace.activities.length === 0 ? (
            <div className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm text-muted-foreground">
              No activity recorded yet. Completed AI workflows and communications will appear here.
            </div>
          ) : (
            workspace.activities.slice(0, 5).map((activity) => (
              <div key={activity.id} className="rounded-md border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">{activity.subject}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">{activity.activity_type.replaceAll("_", " ")}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDateTime(activity.created_at)}</p>
                </div>
                {activity.body ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{activity.body}</p> : null}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-card/80 p-5">
        <DocumentUploadForm applicationId={application.id} documents={workspace.documents} />
      </section>

      <section className="rounded-lg border border-white/10 bg-card/80 p-5">
        <div className="flex items-center gap-3">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-white">Lender matching readiness</h2>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <ReadinessCard label="Revenue profile" status={application.monthly_deposits > 0 ? "Complete" : "Pending"} />
          <ReadinessCard label="Deposit verification" status={requiredDocuments > 0 ? "Pending" : "Ready"} />
          <ReadinessCard label="Use of funds" status={application.funding_purpose ? "Complete" : "Pending"} />
        </div>
      </section>
    </div>
  );
}

function ReadinessCard({ label, status }: { label: string; status: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <p className="text-sm font-semibold text-white">{label}</p>
      <p className="mt-2 text-sm text-muted-foreground">{status}</p>
    </div>
  );
}

function buildTimeline(status: string | null, createdAt: string | null, updatedAt: string | null) {
  const order = [
    "new_lead",
    "onboarding",
    "submitted",
    "documents_pending",
    "ai_review",
    "underwriting_review",
    "reviewing",
    "submitted_to_lender",
    "routed",
    "approved",
    "funded"
  ];
  const currentIndex = status ? order.indexOf(status) : -1;

  return [
    { title: "Lead captured", date: createdAt ? formatDateTime(createdAt) : "-", status: currentIndex >= 0 ? "complete" : "upcoming" },
    { title: "Merchant onboarding", date: createdAt ? formatDateTime(createdAt) : "-", status: currentIndex >= 1 ? "complete" : currentIndex === 0 ? "current" : "upcoming" },
    { title: "Document collection", date: updatedAt ? formatDateTime(updatedAt) : "-", status: currentIndex >= 3 ? "complete" : currentIndex === 2 ? "current" : "upcoming" },
    { title: "AI underwriting", date: updatedAt ? formatDateTime(updatedAt) : "-", status: currentIndex >= 4 ? "complete" : currentIndex === 4 ? "current" : "upcoming" },
    { title: "Underwriting review", date: updatedAt ? formatDateTime(updatedAt) : "-", status: currentIndex >= 5 ? "complete" : currentIndex === 5 ? "current" : "upcoming" },
    { title: "Lender routing", date: updatedAt ? formatDateTime(updatedAt) : "-", status: currentIndex >= 8 ? "complete" : currentIndex >= 6 ? "current" : "upcoming" },
    { title: "Funding decision", date: updatedAt ? formatDateTime(updatedAt) : "-", status: currentIndex >= 10 ? "complete" : currentIndex === 9 ? "current" : "upcoming" }
  ];
}
