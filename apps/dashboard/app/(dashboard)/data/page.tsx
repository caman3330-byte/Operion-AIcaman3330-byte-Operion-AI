import { DataWorkspace } from "@/components/data/data-workspace";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  if (!["founder", "admin", "super_admin"].includes(access.role)) return <ProtectedPageRedirect to="/unauthorized" reason="Founder or administrator access required for business data" />;
  return <DataWorkspace source="ai" />;
}
