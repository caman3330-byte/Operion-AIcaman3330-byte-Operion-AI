export const dynamic = "force-dynamic";
import LeadsPage from "@/app/(dashboard)/leads/page";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";

export default async function AdminLeadsPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) {
    return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  }

  return <LeadsPage />;
}
