export const dynamic = "force-dynamic";
import LendersPage from "@/app/(dashboard)/lenders/page";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";

export default async function AdminLendersPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) {
    return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  }

  return <LendersPage />;
}
