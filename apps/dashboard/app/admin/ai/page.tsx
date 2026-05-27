export const dynamic = "force-dynamic";
import AiPromptsPage from "@/app/(dashboard)/ai-prompts/page";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";

export default async function AdminAiPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) {
    return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  }

  return <AiPromptsPage />;
}
