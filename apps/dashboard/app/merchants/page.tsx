import Link from "next/link";
import type { Route as NextRoute } from "next";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getMerchantPipelineData } from "@/lib/data/merchant-profile";

export const dynamic = "force-dynamic";

function merchantDetailHref(applicationId: string) {
  return `/merchants/${applicationId}` as NextRoute;
}

function classifyScope(record: unknown): "live" | "qa" {
  const text = JSON.stringify(record ?? {}).toLowerCase();
  const isQa =
    text.includes('"is_test_data":true') ||
    text.includes('"test_mode":true') ||
    text.includes('"simulation":true') ||
    text.includes("simulation") ||
    text.includes("operion-e2e") ||
    text.includes("live-verification") ||
    text.includes(".test.operion.ai");
  return isQa ? "qa" : "live";
}

function statusVariant(status: string) {
  if (status === "funded" || status === "approved") return "success";
  if (status === "rejected" || status === "inactive") return "destructive";
  if (status === "documents_pending" || status === "underwriting_review" || status === "ai_review") return "warning";
  return "secondary";
}

export default async function MerchantsPage({ searchParams }: { searchParams?: Promise<{ q?: string; status?: string }> }) {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const { applications: allApplications, counts } = await getMerchantPipelineData();
  const params = await searchParams;
  const query = (params?.q ?? "").trim().toLowerCase();
  const status = params?.status ?? "";
  const applications = allApplications.filter((application) => {
    const matchesQuery = !query || [application.business_name, application.id, application.contact_email].some((value) => String(value ?? "").toLowerCase().includes(query));
    const matchesStatus = !status || application.status === status;
    return matchesQuery && matchesStatus;
  });
  const liveCount = applications.filter((a) => classifyScope(a) === "live").length;
  const qaCount = applications.length - liveCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Merchant Pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review merchant applications, funding readiness, underwriting state, and CRM activity from one operations dashboard.
        </p>
      </div>

      <form className="flex flex-wrap gap-3" method="get">
        <input name="q" defaultValue={params?.q ?? ""} placeholder="Search business, application ID, or email" aria-label="Search merchants" className="min-w-0 basis-64 flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground" />
        <select name="status" defaultValue={status} className="rounded-md border border-white/10 bg-card/80 px-3 py-2 text-sm text-white">
          <option value="">All statuses</option>
          {['awaiting_documents','documents_uploaded','underwriting_review','ai_review','submitted','funded','rejected'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
        </select>
        <Button type="submit">Search</Button>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-card/80 p-5">
          <p className="text-sm text-muted-foreground">Live merchants</p>
          <p className="mt-3 text-3xl font-semibold text-white">{liveCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">{qaCount} QA / {applications.length} total</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-card/80 p-5">
          <p className="text-sm text-muted-foreground">Documents pending</p>
          <p className="mt-3 text-3xl font-semibold text-white">{counts.documents_pending ?? 0}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-card/80 p-5">
          <p className="text-sm text-muted-foreground">Underwriting review</p>
          <p className="mt-3 text-3xl font-semibold text-white">{counts.underwriting_review ?? 0}</p>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto rounded-lg border border-border bg-card" role="region" aria-label="Merchant applications" tabIndex={0}>
        <table className="min-w-full divide-y divide-white/5 text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Scope</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Requested</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">File Room</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {applications.map((application) => {
              const scope = classifyScope(application);
              return (
              <tr key={application.id} className="hover:bg-white/5">
                <td className="px-4 py-4">
                  <Link
                    href={merchantDetailHref(application.id)}
                    className="font-medium text-white hover:text-primary"
                  >
                    {application.business_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{application.contact_email}</p>
                </td>
                <td className="px-4 py-4">
                  <Badge variant={scope === "qa" ? "warning" : "success"}>{scope === "qa" ? "QA" : "Live"}</Badge>
                </td>
                <td className="px-4 py-4">
                  <Badge variant={statusVariant(application.status)}>{application.status.replaceAll("_", " ")}</Badge>
                </td>
                <td className="px-4 py-4 text-white">{formatCurrency(Number(application.requested_amount))}</td>
                <td className="px-4 py-4 text-muted-foreground">{application.state ?? "N/A"}</td>
                <td className="px-4 py-4 text-muted-foreground">{formatDateTime(application.updated_at)}</td>
                <td className="px-4 py-4"><Button asChild variant="outline" size="sm"><Link href={`${merchantDetailHref(application.id)}#documents` as NextRoute}>Review files</Link></Button></td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
