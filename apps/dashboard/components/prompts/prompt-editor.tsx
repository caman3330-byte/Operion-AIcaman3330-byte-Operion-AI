"use client";

import { useState } from "react";
import { Save, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function PromptEditor() {
  const [label, setLabel] = useState("v1.2-candidate");
  const [systemPrompt, setSystemPrompt] = useState("You are Operion AI Qualification Agent. Return strict JSON only.");
  const [userPrompt, setUserPrompt] = useState(
    "Evaluate this business funding lead and return {\"score\":number,\"tier\":\"A|B|C|D\",\"reason\":\"string\"}: {{lead_json}}"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Prompt Editor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="prompt-label">Version label</Label>
          <Input id="prompt-label" value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="system-prompt">System prompt</Label>
          <Textarea id="system-prompt" className="min-h-28" value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="user-prompt">User prompt template</Label>
          <Textarea id="user-prompt" className="min-h-32" value={userPrompt} onChange={(event) => setUserPrompt(event.target.value)} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline">
            <TestTube2 className="h-4 w-4" />
            Run Test Batch
          </Button>
          <Button>
            <Save className="h-4 w-4" />
            Save New Version
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
