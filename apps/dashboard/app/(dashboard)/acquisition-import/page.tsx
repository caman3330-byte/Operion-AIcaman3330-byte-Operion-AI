import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { ManualAcquisitionImportPanel } from "./manual-acquisition-import-panel";

export default async function AcquisitionImportPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  return <ManualAcquisitionImportPanel />;
}
