import { BrainCircuit } from "lucide-react";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { ManagerAgentForm } from "@/components/manager-agent/manager-agent-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { agentRegistry } from "@/lib/manager-agent/registry";
import { managerAgentRepository } from "@/lib/repositories/manager-agent";

export const dynamic = "force-dynamic";

export default async function ManagerAgentPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const runs = await managerAgentRepository.listRuns(10).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Manager Agent</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Central AI orchestration for assigning bounded work to specialized Operion agents.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <ManagerAgentForm />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Specialized Agents</CardTitle>
            <BrainCircuit className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-3">
            {agentRegistry.map((agent) => (
              <div key={agent.id} className="rounded-md border p-3">
                <p className="text-sm font-medium">{agent.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{agent.purpose}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {agent.owns.slice(0, 3).map((item) => (
                    <Badge key={item} variant="outline">{item}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Manager Runs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No manager runs recorded yet. Apply the manager-agent migration and configure `ANTHROPIC_API_KEY` to run live orchestration.
            </p>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{run.objective}</p>
                  <Badge variant={run.status === "completed" ? "success" : run.status === "failed" ? "destructive" : "secondary"}>
                    {run.status}
                  </Badge>
                </div>
                {run.final_summary ? <p className="mt-2 text-sm text-muted-foreground">{run.final_summary}</p> : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
