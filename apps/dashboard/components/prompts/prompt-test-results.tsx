import type { PromptTestResult } from "@operion/shared";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PromptTestResultsProps {
  results: PromptTestResult[];
}

export function PromptTestResults({ results }: PromptTestResultsProps) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle>Test Results</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Latency</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result) => (
              <TableRow key={result.id}>
                <TableCell>{result.lead_id?.slice(0, 8) ?? "—"}</TableCell>
                <TableCell>{result.score_produced ?? "—"}</TableCell>
                <TableCell>{result.tier_produced ? <Badge variant="outline">Tier {result.tier_produced}</Badge> : "—"}</TableCell>
                <TableCell>{result.latency_ms ? `${result.latency_ms} ms` : "—"}</TableCell>
                <TableCell>{formatDateTime(result.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
