import { LeadsTable } from "@/components/leads/leads-table";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { getLeadsData } from "@/lib/data/live-data";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const { data: leads, source } = await getLeadsData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review lead quality, approval state, outreach readiness, and founder override actions.
        </p>
      </div>
      {source === "unavailable" ? <p role="alert" className="rounded-md border border-destructive/30 p-4 text-sm">Lead data could not be loaded. This does not mean there are zero leads. Please retry.</p> : <LeadsTable initialLeads={leads} />}
    </div>
  );
}
