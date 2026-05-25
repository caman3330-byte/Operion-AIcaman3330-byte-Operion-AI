"use client";

import { useState, useTransition } from "react";
import { Pause, Play, RotateCcw, Trash2, Download, FlaskConical, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const industries = ["trucking", "logistics", "construction", "ecommerce", "restaurants", "retail", "healthcare", "manufacturing"];

export function SimulationControls() {
  const [batchSize, setBatchSize] = useState("10");
  const [mode, setMode] = useState("standard");
  const [pipelineLimit, setPipelineLimit] = useState("10");
  const [industry, setIndustry] = useState("trucking");
  const [replayRunId, setReplayRunId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runAction(action: () => Promise<Response>, success: string) {
    setMessage(null);
    startTransition(async () => {
      try {
        const response = await action();
        const payload = await response.json();
        if (!response.ok) {
          setMessage(payload.error?.message ?? "Request failed");
          return;
        }
        setMessage(success);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Request failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="batch-size">Batch</Label>
          <Select id="batch-size" value={batchSize} onChange={(event) => setBatchSize(event.target.value)}>
            <option value="10">10 leads</option>
            <option value="100">100 leads</option>
            <option value="1000">1,000 leads</option>
            <option value="10000">10,000 leads</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mode">Mode</Label>
          <Select id="mode" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="standard">Standard</option>
            <option value="stress">Stress</option>
            <option value="replay">Replay</option>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="industry">Industry</Label>
          <Select id="industry" value={industry} onChange={(event) => setIndustry(event.target.value)}>
            {industries.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pipeline-limit">Pipeline Limit</Label>
          <Input id="pipeline-limit" value={pipelineLimit} onChange={(event) => setPipelineLimit(event.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="replay-run">Replay Run ID</Label>
        <Input id="replay-run" value={replayRunId} onChange={(event) => setReplayRunId(event.target.value)} placeholder="simulation run uuid" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={isPending}
          onClick={() =>
            runAction(
              () =>
                fetch("/api/simulation/run", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    batch_size: Number(batchSize),
                    industries: [industry],
                    mode,
                    pipeline_limit: Number(pipelineLimit)
                  })
                }),
              "Simulation run started and completed for the selected batch."
            )
          }
        >
          <FlaskConical className="h-4 w-4" />
          Run Simulation
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            runAction(
              () =>
                fetch("/api/simulation/replay", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ simulation_run_id: replayRunId, pipeline_limit: Number(pipelineLimit) })
                }),
              "Replay workflow started."
            )
          }
        >
          <RotateCcw className="h-4 w-4" />
          Replay Workflow
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            runAction(
              () =>
                fetch("/api/simulation/controls", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ action: "pause", reason: "Paused from testing dashboard" })
                }),
              "Workers paused."
            )
          }
        >
          <Pause className="h-4 w-4" />
          Pause Workers
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            runAction(
              () =>
                fetch("/api/simulation/controls", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ action: "resume", reason: "Resumed from testing dashboard" })
                }),
              "Workers resumed."
            )
          }
        >
          <Play className="h-4 w-4" />
          Resume Workers
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            runAction(
              () =>
                fetch("/api/diagnostics/readiness", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({})
                }),
              "Readiness report generated."
            )
          }
        >
          <RotateCcw className="h-4 w-4" />
          Generate Report
        </Button>
        <Button
          variant="outline"
          disabled={isPending}
          onClick={() =>
            runAction(
              () =>
                fetch("/api/simulation/outreach-preview", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    batch_size: Number(batchSize),
                    industries: [industry],
                    sample_size: Math.min(Number(pipelineLimit), 5)
                  })
                }),
              "Outreach preview generated for synthetic merchants and lender-routing emails."
            )
          }
        >
          <Mail className="h-4 w-4" />
          Outreach Preview
        </Button>
        <Button asChild variant="outline">
          <a href="/api/simulation/export-logs" target="_blank" rel="noreferrer">
            <Download className="h-4 w-4" />
            Export Logs
          </a>
        </Button>
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() =>
            runAction(
              () =>
                fetch("/api/simulation/clear", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ confirmation: "CLEAR_TEST_DATA" })
                }),
              "Test data cleared."
            )
          }
        >
          <Trash2 className="h-4 w-4" />
          Clear Test Data
        </Button>
      </div>

      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
