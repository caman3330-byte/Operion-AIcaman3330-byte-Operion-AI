"use client";

import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ManagerAgentResponse {
  data?: {
    run: {
      final_summary: string | null;
      status: string;
    };
    tasks: Array<{
      agent_name: string;
      title: string;
      priority: string;
    }>;
  };
  error?: {
    message: string;
  };
}

export function ManagerAgentForm() {
  const [objective, setObjective] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ManagerAgentResponse["data"] | null>(null);

  async function submitObjective(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setResult(null);

    try {
      const response = await fetch("/api/manager-agent/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective })
      });
      const body = (await response.json()) as ManagerAgentResponse;

      if (!response.ok) {
        setMessage(body.error?.message ?? "Manager-agent run failed");
        return;
      }

      setResult(body.data ?? null);
      setObjective("");
    } catch {
      setMessage("Manager-agent request failed before reaching the API route.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Manager Agent</CardTitle>
        <Bot className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submitObjective}>
          <div className="space-y-2">
            <Label htmlFor="manager-objective">Objective</Label>
            <Textarea
              id="manager-objective"
              className="min-h-32"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Assign agents to review today's lead pipeline, identify blockers, and summarize required founder actions."
              required
            />
          </div>
          <Button type="submit" disabled={loading || objective.trim().length < 10}>
            <Send className="h-4 w-4" />
            {loading ? "Assigning" : "Assign Agents"}
          </Button>
        </form>

        {message ? <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{message}</p> : null}

        {result ? (
          <div className="mt-5 space-y-3 rounded-md border p-4">
            <p className="text-sm font-medium">Final Summary</p>
            <p className="text-sm text-muted-foreground">{result.run.final_summary}</p>
            <div className="space-y-2">
              {result.tasks.map((task) => (
                <div key={`${task.agent_name}-${task.title}`} className="rounded-md border bg-background p-3 text-sm">
                  <div className="font-medium">{task.title}</div>
                  <div className="text-muted-foreground">{task.agent_name} · {task.priority}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
