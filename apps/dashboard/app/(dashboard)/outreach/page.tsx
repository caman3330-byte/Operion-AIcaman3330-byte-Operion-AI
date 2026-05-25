import { Mail, MessageSquareReply, MousePointerClick, ShieldCheck } from "lucide-react";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { MetricCard } from "@/components/metrics/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { acquisitionRepository, isAcquisitionMigrationMissing } from "@/lib/repositories/acquisition";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const access = await getInternalPageAccess();
  if (!access.allowed) return <ProtectedPageRedirect to={access.to} reason={access.reason} />;

  try {
    const [summary, campaigns, queue, replies] = await Promise.all([
      acquisitionRepository.summary(),
      acquisitionRepository.listCampaigns(8),
      acquisitionRepository.listEmailQueue(12),
      acquisitionRepository.listReplies(8)
    ]);
    const replyRate =
      summary.outreach.sent_emails === 0 ? 0 : Math.round((summary.outreach.replies / summary.outreach.sent_emails) * 100);

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Outreach</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              AI SDR campaigns, approval-gated email queue, SendGrid delivery, reply analytics, and hot-lead escalation.
            </p>
          </div>
          <Badge variant="success">Queue-backed</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Active Campaigns" value={String(summary.outreach.active_campaigns)} detail={`${summary.outreach.campaigns} total`} icon={Mail} />
          <MetricCard title="Queued Emails" value={String(summary.outreach.queued_emails)} detail="Ready for worker execution" icon={MousePointerClick} />
          <MetricCard title="Approval Gated" value={String(summary.outreach.pending_approval_emails)} detail="Founder review required" icon={ShieldCheck} tone="warning" />
          <MetricCard title="Reply Rate" value={`${replyRate}%`} detail={`${summary.outreach.positive_replies} positive reply(s)`} icon={MessageSquareReply} tone={replyRate > 5 ? "success" : "default"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <Card>
            <CardHeader>
              <CardTitle>Campaigns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {campaigns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outreach campaigns created yet.</p>
              ) : (
                campaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{campaign.name}</p>
                      <Badge variant={campaign.status === "active" ? "success" : campaign.status === "pending_approval" ? "warning" : "secondary"}>
                        {campaign.status}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{campaign.description ?? "No description"}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Queue</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Scheduled</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.to_email}</TableCell>
                      <TableCell>{item.subject}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "failed"
                              ? "destructive"
                              : item.status === "sent"
                                ? "success"
                                : item.status === "pending_approval"
                                  ? "warning"
                                  : "secondary"
                          }
                        >
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(item.scheduled_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Reply Analytics</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From</TableHead>
                  <TableHead>Classification</TableHead>
                  <TableHead className="text-right">Intent</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead>Escalated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {replies.map((reply) => (
                  <TableRow key={reply.id}>
                    <TableCell className="font-medium">{reply.from_email}</TableCell>
                    <TableCell>
                      <Badge variant={reply.classification === "positive" ? "success" : reply.classification === "opt_out" ? "destructive" : "secondary"}>
                        {reply.classification}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{reply.intent_score ?? 0}</TableCell>
                    <TableCell>{formatDateTime(reply.received_at)}</TableCell>
                    <TableCell>{reply.escalated ? "Yes" : "No"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  } catch (error) {
    if (isAcquisitionMigrationMissing(error)) {
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-normal">Outreach</h1>
            <p className="mt-1 text-sm text-muted-foreground">Outreach infrastructure is coded and waiting for the database migration.</p>
          </div>
          <Card className="border-warning bg-warning/10">
            <CardHeader>
              <CardTitle>Migration Required</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Apply <span className="font-medium text-foreground">packages/database/migrations/0004_lead_acquisition_outreach.sql</span> in
              Supabase SQL Editor to activate campaigns, sequences, email queue, and reply analytics.
            </CardContent>
          </Card>
        </div>
      );
    }

    throw error;
  }
}
