import { BarChart3, CalendarDays, CheckCircle2, MousePointerClick, Target, TrendingUp, UsersRound } from "lucide-react";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMerchantFunnelSummary, type FunnelEvent, type FunnelSource } from "@/lib/analytics/merchant-funnel";

export const dynamic = "force-dynamic";

const sourceLabels: Record<FunnelSource, string> = {
  instagram: "Instagram",
  "business-funding": "Business Funding",
  direct: "Direct",
  organic: "Organic",
  referral: "Referral"
};

export default async function MerchantAcquisitionPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const funnel = await getMerchantFunnelSummary();
  const landingVisits = funnel.totals.ig_visit + funnel.totals.business_funding_visit + funnel.totals.landing_page_visit;
  const ctaRate = landingVisits > 0 ? Math.round((funnel.totals.apply_cta_click / landingVisits) * 100) : 0;
  const startRate = funnel.totals.apply_cta_click > 0 ? Math.round((funnel.totals.application_started / funnel.totals.apply_cta_click) * 100) : 0;
  const completionRate = funnel.totals.application_started > 0 ? Math.round((funnel.totals.application_completed / funnel.totals.application_started) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Merchant Pipeline</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">Merchant Acquisition Funnel</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Landing-page traffic, apply intent, source attribution, and application conversion visibility.
          </p>
        </div>
        <Badge variant="success">Visibility only</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Landing Page Visits" value={String(landingVisits)} detail="/ig + /business-funding + tracked landing views" icon={UsersRound} />
        <MetricCard title="/ig Visits" value={String(funnel.totals.ig_visit)} detail="Instagram landing page views" icon={Target} />
        <MetricCard title="/business-funding Visits" value={String(funnel.totals.business_funding_visit)} detail="Merchant funding page views" icon={BarChart3} />
        <MetricCard title="Apply CTA Clicks" value={String(funnel.totals.apply_cta_click)} detail={`${ctaRate}% of landing visits`} icon={MousePointerClick} tone={ctaRate >= 8 ? "success" : "default"} />
        <MetricCard title="Applications Started" value={String(funnel.totals.application_started)} detail={`${startRate}% of apply clicks`} icon={TrendingUp} tone={startRate >= 50 ? "success" : "warning"} />
        <MetricCard title="Applications Completed" value={String(funnel.totals.application_completed)} detail={`${completionRate}% of starts`} icon={CheckCircle2} tone={completionRate >= 35 ? "success" : "warning"} />
        <MetricCard title="Applications by Source" value={String(funnel.sourceBreakdown.reduce((sum, row) => sum + row.applications, 0))} detail="Grouped from application metadata" icon={CalendarDays} />
        <MetricCard title="Conversion Rate" value={`${funnel.conversionRate}%`} detail="Completed applications / tracked visits" icon={TrendingUp} tone={funnel.conversionRate >= 3 ? "success" : "default"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Source Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {funnel.sourceBreakdown.map((source) => (
              <div key={source.source} className="rounded-md border bg-white/[0.025] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-white">{sourceLabels[source.source]}</p>
                  <Badge variant={source.applications > 0 ? "success" : "outline"}>{source.conversionRate}%</Badge>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <MetricLine label="Visits" value={source.visits} />
                  <MetricLine label="CTA clicks" value={source.ctaClicks} />
                  <MetricLine label="Applications" value={source.applications} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <TrendTable title="Daily Trend" rows={funnel.dailyTrend} labelHeader="Day" />
        <TrendTable title="Weekly Trend" rows={funnel.weeklyTrend} labelHeader="Week" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>KPI Definitions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {[
            ["Landing Page Visits", "Tracked visits to merchant acquisition landing pages."],
            ["Apply CTA Clicks", "Clicks on application CTAs from /ig or /business-funding."],
            ["Applications Started", "First interaction with the application form."],
            ["Applications Completed", "Created business application records grouped by attribution metadata."],
            ["Applications by Source", "Completed applications grouped into instagram, business-funding, direct, organic, referral."],
            ["Conversion Rate", "Completed applications divided by tracked landing visits."]
          ].map(([label, definition]) => (
            <div key={label} className="rounded-md border bg-white/[0.025] p-3">
              <p className="text-sm font-semibold text-white">{label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{definition}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function TrendTable({
  title,
  rows,
  labelHeader
}: {
  title: string;
  rows: Array<Record<FunnelEvent, number> & { label: string }>;
  labelHeader: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labelHeader}</TableHead>
              <TableHead>Visits</TableHead>
              <TableHead>CTA</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const visits = row.landing_page_visit + row.ig_visit + row.business_funding_visit;
              return (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell>{visits}</TableCell>
                  <TableCell>{row.apply_cta_click}</TableCell>
                  <TableCell>{row.application_started}</TableCell>
                  <TableCell>{row.application_completed}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
