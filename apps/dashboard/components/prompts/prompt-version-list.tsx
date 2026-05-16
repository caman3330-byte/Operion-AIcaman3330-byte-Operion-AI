"use client";

import { useState } from "react";
import type { PromptVersion } from "@operion/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

interface PromptVersionListProps {
  versions: PromptVersion[];
}

export function PromptVersionList({ versions }: PromptVersionListProps) {
  const [activeId, setActiveId] = useState(versions.find((version) => version.active)?.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt Versions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {versions.map((version) => {
          const active = version.id === activeId;
          return (
            <div key={version.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">v{version.version_number}</span>
                    <span className="text-sm text-muted-foreground">{version.label}</span>
                    {active ? <Badge variant="success">active</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(version.created_at)} · {version.created_by ?? "unknown"}</p>
                </div>
                <Button size="sm" variant={active ? "secondary" : "outline"} disabled={active} onClick={() => setActiveId(version.id)}>
                  {active ? "Active" : "Activate"}
                </Button>
              </div>
              {version.notes ? <p className="mt-3 text-sm text-muted-foreground">{version.notes}</p> : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
