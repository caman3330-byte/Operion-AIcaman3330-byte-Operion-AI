export const dynamic = "force-dynamic";
import TestingPage from "@/app/(dashboard)/testing/page";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";

export default async function AdminTestingPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) {
    return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  }

  return <TestingPage />;
}
