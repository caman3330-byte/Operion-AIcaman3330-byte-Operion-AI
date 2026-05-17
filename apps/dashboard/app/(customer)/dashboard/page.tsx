import type { LucideIcon } from "lucide-react";
import { ArrowRight, Bot, CheckCircle2, Clock3, FileText, Landmark, UploadCloud } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCustomerWorkspaceData } from "@/lib/data/customer-workspace";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CustomerDashboardPage() {
  const workspace = await getCustomerWorkspaceData();
  const latestApplication = workspace.applications[0] ?? null;
  const requestedFunding = latestApplication ? formatCurrency(Number(latestApplication.requested_amount)) : "-";
  const requestedDocuments = workspace.documents.filter((document) => document.status === "requested").length;
  const uploadedDocuments = workspace.documents.filter((document) => document.status === "uploaded" || document.status === "verified").length;
  const readiness = workspace.documents.length === 0 ? 0 : Math.round((uploadedDocuments / workspace.documents.length) * 100);
  const stages = buildStages(latestApplication?.status ?? null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Badge variant="outline">Customer dashboard</Badge>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal text-white">Funding workspace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Track your application, review next steps, prepare documents, and follow lender matching progress.
          </p>
        </div>
        <Button asChild>
          <Link href={latestApplication ? "/application-status" : "/apply"}>
            {latestApplication ? "View status" : "Start application"}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Requested funding" value={requestedFunding} detail={latestApplication?.product_type.replaceAll("_", " ") ?? "No request"} icon={FileText} />
        <Metric title="Profile readiness" value={`${readiness}%`} detail={`${requestedDocuments} document requests open`} icon={CheckCircle2} />
        <Metric title="Review stage" value={latestApplication?.status.replaceAll("_", " ") ?? "Not started"} detail="Supabase application status" icon={Bot} />
        <Metric title="Funding offers" value={String(workspace.offers.length)} detail="Offers stored for this account" icon={Landmark} />
      </div>

      {!latestApplication ? (
        <section className="rounded-lg border border-white/10 bg-card/80 p-6">
          <h2 className="text-xl font-semibold text-white">No funding application yet</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Submit a funding application to create a lead, AI qualification task, document checklist, and internal review workflow.
          </p>
          <Button asChild className="mt-5">
            <Link href="/apply">Apply for funding</Link>
          </Button>
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-lg border border-white/10 bg-card/80 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-white">Funding progress</h2>
                <p className="mt-1 text-sm text-muted-foreground">Application flow from intake to lender matching.</p>
              </div>
              <Badge variant={latestApplication.status === "funded" || latestApplication.status === "approved" ? "success" : "warning"}>
                {latestApplication.status.replaceAll("_", " ")}
              </Badge>
            </div>
            <div className="mt-6 grid gap-4">
              {stages.map((stage, index) => (
                <div key={stage.label} className="flex items-center gap-4">
                  <span className={stage.complete ? "flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground" : "flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-muted-foreground"}>
                    {stage.complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{stage.label}</p>
                    <div className="mt-2 h-1.5 rounded-full bg-white/10">
                      <div className={stage.complete ? "h-1.5 rounded-full bg-primary" : "h-1.5 w-1/3 rounded-full bg-white/20"} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-card/80 p-5">
            <div className="flex items-center gap-3">
              <Bot className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-white">AI funding assistant</h2>
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              AI qualification runs after submission and writes its score, summary, and review task to the internal underwriting queue.
            </p>
            <div className="mt-5 rounded-md border border-primary/20 bg-primary/10 p-4">
              <p className="text-sm font-semibold text-white">Next best action</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {requestedDocuments > 0 ? "Prepare the requested documents for verification." : "No customer action is required right now."}
              </p>
            </div>
          </section>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Document checklist" icon={UploadCloud}>
          {workspace.documents.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">No document requests are stored for this account.</p>
          ) : (
            workspace.documents.map((document) => (
              <div key={document.id} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">
                <span className="text-sm text-muted-foreground">{document.document_type.replaceAll("_", " ")}</span>
                <Badge variant={document.status === "verified" ? "success" : document.status === "requested" ? "warning" : "secondary"}>
                  {document.status}
                </Badge>
              </div>
            ))
          )}
        </Panel>
        <Panel title="Funding offers" icon={Landmark}>
          {workspace.offers.length === 0 ? (
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm text-muted-foreground">No offers have been issued yet.</div>
          ) : (
            workspace.offers.map((offer) => (
              <div key={offer.id} className="rounded-md border border-white/10 bg-white/[0.035] p-3">
                <p className="text-sm font-semibold text-white">{formatCurrency(Number(offer.amount))}</p>
                <p className="mt-1 text-xs text-muted-foreground">{offer.status}</p>
              </div>
            ))
          )}
        </Panel>
        <Panel title="Activity" icon={Clock3}>
          {workspace.applications.length === 0 ? (
            <p className="text-sm leading-6 text-muted-foreground">No account activity yet.</p>
          ) : (
            workspace.applications.slice(0, 4).map((application) => (
              <div key={application.id} className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-muted-foreground">
                {application.business_name} - {application.status.replaceAll("_", " ")} - {formatDateTime(application.updated_at)}
              </div>
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

function Metric({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: LucideIcon }) {
  return (
    <div className="rounded-lg border border-white/10 bg-card/80 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-4 text-3xl font-semibold text-white capitalize">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground capitalize">{detail}</p>
    </div>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-card/80 p-5">
      <div className="mb-4 flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-white">{title}</h2>
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function buildStages(status: string | null) {
  const order = ["submitted", "ai_review", "needs_review", "reviewing", "submitted_to_lender", "approved", "funded"];
  const currentIndex = status ? order.indexOf(status) : -1;

  return [
    { label: "Application submitted", complete: currentIndex >= 0 },
    { label: "AI qualification", complete: currentIndex >= 1 },
    { label: "Underwriting review", complete: currentIndex >= 3 },
    { label: "Lender readiness", complete: currentIndex >= 4 }
  ];
}
