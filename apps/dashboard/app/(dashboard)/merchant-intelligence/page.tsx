import { Activity, AlertTriangle, BrainCircuit, CheckCircle2, DatabaseZap, Globe2, ShieldAlert, TrendingUp } from "lucide-react";
import { MetricCard } from "@/components/metrics/metric-card";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { acquisitionRepository } from "@/lib/repositories/acquisition";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MerchantIntelligencePage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  const [metrics, sources, discoveryRuns] = await Promise.all([
    acquisitionRepository.merchantIntelligenceMetrics(),
    acquisitionRepository.listMerchantSources({ limit: 200 }),
    acquisitionRepository.listMerchantSourceDiscoveryRuns(10)
  ]);
  const rankedSources = [...sources].sort((left, right) =>
    Number(right.acquisition_yield_score ?? 0) - Number(left.acquisition_yield_score ?? 0) ||
    Number(right.source_quality_score ?? 0) - Number(left.source_quality_score ?? 0)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Merchant Pipeline</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">Merchant Intelligence</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Source discovery, source scoring, extraction health, and founder-gated recommendations for real merchant acquisition.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Candidate-only discovery</Badge>
          <Badge variant="outline">Founder approval required</Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Candidate Sources" value={String(metrics.candidate_sources)} detail="Awaiting review" icon={BrainCircuit} tone={metrics.candidate_sources > 0 ? "warning" : "default"} />
        <MetricCard title="Active Sources" value={String(metrics.active_sources)} detail="Approved and usable" icon={DatabaseZap} tone="success" />
        <MetricCard title="Failed Sources" value={String(metrics.failed_sources)} detail={`${metrics.robots_blocked} blocked by robots or policy`} icon={ShieldAlert} tone={metrics.failed_sources > 0 ? "warning" : "default"} />
        <MetricCard title="Verified Merchants" value={String(metrics.verified_merchants_discovered)} detail="Discovered, not imported" icon={CheckCircle2} tone="success" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Estimated Capacity" value={String(metrics.estimated_acquisition_capacity)} detail="Approx. merchant pool" icon={Globe2} />
        <MetricCard title="Yield Score" value={`${metrics.average_yield_score}/100`} detail="Average tested yield" icon={TrendingUp} tone={metrics.average_yield_score >= 60 ? "success" : "warning"} />
        <MetricCard title="Promote" value={String(metrics.promote_recommendations)} detail="Needs founder activation" icon={Activity} tone={metrics.promote_recommendations > 0 ? "success" : "default"} />
        <MetricCard title="Retire" value={String(metrics.retire_recommendations)} detail="Repeated low value" icon={AlertTriangle} tone={metrics.retire_recommendations > 0 ? "warning" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Performing Industries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.top_industries.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-md border p-3">
                  <span className="capitalize">{item.label.replace(/_/g, " ")}</span>
                  <Badge variant="secondary">{item.count} sources</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Performing States</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {metrics.top_states.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-md border p-3">
                  <span>{item.label}</span>
                  <Badge variant="secondary">{item.count} sources</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Source Intelligence Registry</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Health</TableHead>
                <TableHead className="text-right">Quality</TableHead>
                <TableHead className="text-right">Yield</TableHead>
                <TableHead>Recommendation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rankedSources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="max-w-md">
                      <p className="font-medium">{source.source_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{source.source_url}</p>
                    </div>
                  </TableCell>
                  <TableCell className="capitalize">{source.industry.replace(/_/g, " ")}</TableCell>
                  <TableCell>{source.state ?? "National"}</TableCell>
                  <TableCell><Badge variant={source.approval_status === "approved" ? "success" : source.approval_status === "pending_review" ? "warning" : "destructive"}>{source.approval_status.replace(/_/g, " ")}</Badge></TableCell>
                  <TableCell><Badge variant={healthVariant(source.health_status)}>{source.health_status}</Badge></TableCell>
                  <TableCell className="text-right">{source.source_quality_score}</TableCell>
                  <TableCell className="text-right">{source.acquisition_yield_score}</TableCell>
                  <TableCell><Badge variant={recommendationVariant(source.recommendation)}>{source.recommendation.replace(/_/g, " ")}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Discovery Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Found</TableHead>
                <TableHead className="text-right">Stored</TableHead>
                <TableHead className="text-right">Duplicates</TableHead>
                <TableHead className="text-right">Blocked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discoveryRuns.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{formatDateTime(run.started_at)}</TableCell>
                  <TableCell><Badge variant={run.status === "completed" ? "success" : run.status === "failed" ? "destructive" : "secondary"}>{run.status}</Badge></TableCell>
                  <TableCell className="text-right">{run.candidate_sources_found}</TableCell>
                  <TableCell className="text-right">{run.candidate_sources_stored}</TableCell>
                  <TableCell className="text-right">{run.duplicates}</TableCell>
                  <TableCell className="text-right">{run.blocked_or_unreachable}</TableCell>
                </TableRow>
              ))}
              {discoveryRuns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No merchant intelligence discovery runs have been recorded yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function healthVariant(status: string) {
  if (status === "active") return "success";
  if (status === "degraded") return "warning";
  if (status === "blocked") return "destructive";
  return "secondary";
}

function recommendationVariant(status: string) {
  if (status === "promote") return "success";
  if (status === "retire") return "destructive";
  if (status === "degrade") return "warning";
  return "secondary";
}
