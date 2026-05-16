import { AddLenderModal } from "@/components/lenders/add-lender-modal";
import { LendersTable } from "@/components/lenders/lenders-table";
import { getLendersData } from "@/lib/data/live-data";

export const dynamic = "force-dynamic";

export default async function LendersPage() {
  const { data: lenders } = await getLendersData();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Lenders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage lender criteria, pricing, active state, and webhook readiness.
          </p>
        </div>
        <AddLenderModal />
      </div>
      <LendersTable lenders={lenders} />
    </div>
  );
}
