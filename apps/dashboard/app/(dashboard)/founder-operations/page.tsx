import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  DollarSign,
  Mail,
  ShieldCheck,
  TrendingUp,
  UsersRound
} from "lucide-react";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getFounderOperationsDashboard,
  type FounderMetric,
  type FounderQueueRow,
  type FounderReliabilityEvent,
  type FounderSourceRow,
  type FounderTrendRow,
  type MetricAvailability
} from "@/lib/operations/founder-operations";

export const dynamic = "force-dynamic";

const kpiIcons = [UsersRound, CheckCircle2, CheckCircle2, TrendingUp, Mail, Mail, Activity, Mail, CalendarDays, CalendarDays, BarChart3, DollarSign, DollarSign];

export default async function FounderOperationsPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const dashboard = await getFounderOperationsDashboard();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Platform Control</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">Founder Operations Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Existing-data view of acquisition, AI operations, reliability, security, and funding movement.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Read-only</Badge>
          <Badge variant="outline">Existing data only</Badge>
        </div>
      </div>

      <section className="space-y-3">
        <SectionTitle title="Daily KPIs" detail={`Generated ${formatDateTime(dashboard.generatedAt)}`} />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.dailyKpis.map((item, index) => {
            const Icon = kpiIcons[index] ?? Activity;
            return <MetricCard key={item.label} title={item.label} value={item.value} detail={item.detail} icon={Icon} tone={item.tone} />;
          })}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              AI Operations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {dashboard.aiOperations.scheduler.map((item) => (
                <CompactMetric key={item.label} metric={item} />
              ))}
            </div>
            <QueueTable rows={dashboard.aiOperations.queues} />
            <div className="grid gap-3 md:grid-cols-3">
              {dashboard.aiOperations.usage.map((item) => (
                <CompactMetric key={item.label} metric={item} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.security.map((item) => (
              <StatusLine key={item.label} metric={item} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <TrendTable title="Daily Acquisition Trend" rows={dashboard.acquisitionAnalytics.dailyTrend} />
        <TrendTable title="Weekly Trend" rows={dashboard.acquisitionAnalytics.weeklyTrend} />
        <TrendTable title="Monthly Trend" rows={dashboard.acquisitionAnalytics.monthlyTrend} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <SourcePerformanceTable rows={dashboard.acquisitionAnalytics.sourcePerformance} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Top Performing Sources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.acquisitionAnalytics.topSources.length === 0 ? (
              <EmptyState text="No acquisition source performance data available yet." />
            ) : (
              dashboard.acquisitionAnalytics.topSources.map((source) => (
                <div key={`${source.sourceName}-${source.industry}`} className="rounded-md border bg-white/[0.025] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{source.sourceName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {source.industry} · {source.state}
                      </p>
                    </div>
                    <Badge variant={source.verified > 0 ? "success" : "outline"}>{source.verified} verified</Badge>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {source.conversionRate}% conversion · {source.successRate}% success · last scan {formatDate(source.lastScannedAt)}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Reliability
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.reliability.health.map((item) => (
              <StatusLine key={item.label} metric={item} />
            ))}
          </CardContent>
        </Card>
        <ReliabilityEventsTable rows={dashboard.reliability.events} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            Metrics Not Yet Calculable
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {dashboard.unavailableMetrics.map((item) => (
            <CompactMetric key={item.label} metric={item} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold tracking-normal text-white">{title}</h2>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function CompactMetric({ metric }: { metric: FounderMetric }) {
  return (
    <div className="rounded-md border bg-white/[0.025] p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
        <AvailabilityBadge availability={metric.availability} />
      </div>
      <p className="mt-2 text-xl font-semibold tracking-normal text-white">{metric.value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
    </div>
  );
}

function StatusLine({ metric }: { metric: FounderMetric }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border bg-white/[0.025] p-3">
      <div>
        <p className="text-sm font-semibold text-white">{metric.label}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{metric.detail}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={toneToVariant(metric.tone)}>{metric.value}</Badge>
        <AvailabilityBadge availability={metric.availability} />
      </div>
    </div>
  );
}

function AvailabilityBadge({ availability }: { availability: MetricAvailability }) {
  if (availability === "available") return <Badge variant="success">Tracked</Badge>;
  if (availability === "partial") return <Badge variant="warning">Partial</Badge>;
  return <Badge variant="outline">Not tracked</Badge>;
}

function QueueTable({ rows }: { rows: FounderQueueRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Queue</TableHead>
          <TableHead>Queued</TableHead>
          <TableHead>Running</TableHead>
          <TableHead>Failed</TableHead>
          <TableHead>Blocked</TableHead>
          <TableHead>Last Success</TableHead>
          <TableHead>Last Failure</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.label}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell>{row.queued}</TableCell>
            <TableCell>{row.running}</TableCell>
            <TableCell>{row.failed}</TableCell>
            <TableCell>{row.blocked}</TableCell>
            <TableCell>{formatDate(row.lastSuccessAt)}</TableCell>
            <TableCell>{formatDate(row.lastFailureAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function TrendTable({ title, rows }: { title: string; rows: FounderTrendRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Discovered</TableHead>
              <TableHead>Qualified</TableHead>
              <TableHead>Imported</TableHead>
              <TableHead>Apps</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className="font-medium">{row.label}</TableCell>
                <TableCell>{row.discovered}</TableCell>
                <TableCell>{row.qualified}</TableCell>
                <TableCell>{row.imported}</TableCell>
                <TableCell>{row.applications}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SourcePerformanceTable({ rows }: { rows: FounderSourceRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Source Performance</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState text="No merchant acquisition source data available yet." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Discovered</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Conversion</TableHead>
                <TableHead>Last Scan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 12).map((row) => (
                <TableRow key={`${row.sourceName}-${row.industry}-${row.state}`}>
                  <TableCell className="font-medium">{row.sourceName}</TableCell>
                  <TableCell>{row.industry}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.discovered}</TableCell>
                  <TableCell>{row.verified}</TableCell>
                  <TableCell>{row.conversionRate}%</TableCell>
                  <TableCell>{formatDate(row.lastScannedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ReliabilityEventsTable({ rows }: { rows: FounderReliabilityEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Operational Failures</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState text="No failed jobs, blocked scans, or delivery failures found in the current 30-day window." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.label}-${row.occurredAt}-${row.status}`}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell>
                    <Badge variant={toneToVariant(row.tone)}>{row.status}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[320px] truncate">{row.detail}</TableCell>
                  <TableCell>{formatDate(row.occurredAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{text}</div>;
}

function toneToVariant(tone: FounderMetric["tone"]) {
  if (tone === "success") return "success";
  if (tone === "warning") return "warning";
  if (tone === "danger") return "destructive";
  return "outline";
}

function formatDate(value: string | null) {
  if (!value) return "None";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
