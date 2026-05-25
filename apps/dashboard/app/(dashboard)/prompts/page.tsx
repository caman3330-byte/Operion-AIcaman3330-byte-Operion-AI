import { PromptEditor } from "@/components/prompts/prompt-editor";
import { PromptTestResults } from "@/components/prompts/prompt-test-results";
import { PromptVersionList } from "@/components/prompts/prompt-version-list";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { getPromptData } from "@/lib/data/live-data";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const { versions, results } = await getPromptData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Prompt Manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Version qualification prompts, test scoring behavior, and activate approved changes.
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <PromptVersionList versions={versions} />
        <PromptEditor />
        <PromptTestResults results={results} />
      </div>
    </div>
  );
}
