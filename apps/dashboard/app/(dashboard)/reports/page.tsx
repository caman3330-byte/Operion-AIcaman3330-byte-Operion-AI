import { DollarSign, FileText, Landmark, MousePointerClick } from "lucide-react";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { MetricCard } from "@/components/metrics/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { defaultAnalyticsWindow, getSubmissionAnalytics } from "@/lib/analytics/service";
import { getProductionSupervisorSummary } from "@/lib/data/supervisor-command";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const [summary, submissions] = await Promise.all([
    getProductionSupervisorSummary(),
    getSubmissionAnalytics(defaultAnalyticsWindow())
  ]);
  const sourceRows = buildSourceRows(submissions.bySource);
  const reports = [
    {
      date: "Current",
      leads: summary.leads,
      qualified: summary.qualifiedLeads,
      lenderMatches: summary.lenderMatches,
      apiCost: formatCurrency(summary.estimatedAiCostUsd),
      applications: summary.applications
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">Operational metrics backed by production Supabase tables.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Applications" value={String(summary.applications)} detail="Production funding requests" icon={FileText} />
        <MetricCard title="AI/API Cost" value={formatCurrency(summary.estimatedAiCostUsd)} detail="api_usage_logs total" icon={DollarSign} />
        <MetricCard title="Lender Matches" value={String(summary.lenderMatches)} detail="Stored routing outcomes" icon={Landmark} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-muted-foreground" />
            Application Source Attribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sourceRows.map((row) => (
                <TableRow key={row.source}>
                  <TableCell className="font-medium">{formatSource(row.source)}</TableCell>
                  <TableCell>{row.count}</TableCell>
                  <TableCell>{row.share}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Report Archive</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Applications</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Qualified</TableHead>
                <TableHead>Lender Matches</TableHead>
                <TableHead>AI/API Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.date}>
                  <TableCell className="font-medium">{report.date}</TableCell>
                  <TableCell>{report.applications}</TableCell>
                  <TableCell>{report.leads}</TableCell>
                  <TableCell>{report.qualified}</TableCell>
                  <TableCell>{report.lenderMatches}</TableCell>
                  <TableCell>{report.apiCost}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function buildSourceRows(bySource: Record<string, number>) {
  const allowed = ["instagram", "business-funding", "direct", "organic", "referral"];
  const total = allowed.reduce((sum, source) => sum + (bySource[source] ?? 0), 0);
  return allowed.map((source) => {
    const count = bySource[source] ?? 0;
    return {
      source,
      count,
      share: total > 0 ? Math.round((count / total) * 100) : 0
    };
  });
}

function formatSource(source: string) {
  if (source === "business-funding") return "Business Funding";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 4 : 2
  }).format(value);
}
