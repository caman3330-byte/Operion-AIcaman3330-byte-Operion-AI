import { LeadsTable } from "@/components/leads/leads-table";
import { getLeadsData } from "@/lib/data/live-data";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { data: leads } = await getLeadsData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review lead quality, approval state, outreach readiness, and founder override actions.
        </p>
      </div>
      <LeadsTable initialLeads={leads} />
    </div>
  );
}
