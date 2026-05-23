import Link from "next/link";
import { notFound } from "next/navigation";
import { LifecycleControls } from "@/components/merchants/lifecycle-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { getMerchantProfileData } from "@/lib/data/merchant-profile";

export const dynamic = "force-dynamic";

function statusTone(status: string) {
  if (status === "funded" || status === "approved") return "success";
  if (status === "rejected" || status === "inactive") return "destructive";
  if (status === "documents_pending" || status === "underwriting_review" || status === "ai_review") return "warning";
  return "secondary";
}

function getRiskLabel(status: string, missingDocuments: number) {
  if (status === "rejected") return "High risk";
  if (status === "funded") return "Low risk";
  if (missingDocuments > 0) return "Documents needed";
  return "Review in progress";
}

function getFundingProbability(application: any) {
  const metadata = typeof application.metadata === "object" && application.metadata ? (application.metadata as Record<string, unknown>) : {};
  const probability = metadata.funding_probability;
  if (typeof probability === "number") return probability;

  if (application.status === "funded") return 92;
  if (application.status === "approved") return 78;
  if (application.status === "qualified" || application.status === "routed") return 62;
  if (application.status === "documents_pending") return 44;
  return 29;
}

export default async function MerchantDetailsPage({ params }: { params: Promise<{ applicationId: string }> }) {
  let data;
  const resolvedParams = await params;

  try {
    data = await getMerchantProfileData(resolvedParams.applicationId);
  } catch {
    notFound();
  }

  const { application, profile, documents, offers, activities, lenderMatches, underwritingReviews, aiTasks } = data;
  const missingDocuments = documents.filter((document) => document.status !== "verified").length;
  const fundingProbability = getFundingProbability(application);
  const metadata = typeof application.metadata === "object" && application.metadata ? (application.metadata as Record<string, unknown>) : {};
  const internalNotes = typeof metadata.internal_notes === "string" ? metadata.internal_notes : "No internal notes yet.";
  const insights = typeof metadata.ai_summary === "string" ? metadata.ai_summary : typeof metadata.insights === "string" ? metadata.insights : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{application.business_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Merchant profile and application lifecycle for funding review.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusTone(application.status)}>{application.status.replaceAll("_", " ")}</Badge>
          <Badge variant={missingDocuments > 0 ? "destructive" : "success"}>
            {missingDocuments > 0 ? `${missingDocuments} missing doc(s)` : "Documents complete"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Business profile summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Industry</p>
                  <p className="text-white">{application.industry}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">State</p>
                  <p className="text-white">{application.state ?? "Unknown"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monthly deposits</p>
                  <p className="text-white">{formatCurrency(Number(application.monthly_deposits))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Requested amount</p>
                  <p className="text-white">{formatCurrency(Number(application.requested_amount))}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Funding purpose</p>
                  <p className="text-white">{application.funding_purpose ?? "Not provided"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bank name</p>
                  <p className="text-white">{application.bank_name ?? "Not provided"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Merchant controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-muted-foreground">Probability</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{fundingProbability}%</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-muted-foreground">Risk status</p>
                  <p className="mt-2 text-xl font-semibold text-white">{getRiskLabel(application.status, missingDocuments)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-muted-foreground">AI tasks</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{aiTasks.length}</p>
                </div>
              </div>
              <div className="mt-4">
                <LifecycleControls applicationId={application.id} currentStatus={application.status} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI-generated insights</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Underwriting intelligence, funding fit signals, and missing requirement observations.</p>
              <p className="mt-4 text-sm leading-6 text-white">{insights ?? "No AI summary has been produced yet for this application."}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Internal notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">Notes are captured by internal operations and AI workflow evaluations.</p>
              <p className="mt-4 text-sm leading-6 text-white">{internalNotes}</p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Contact & profile</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Primary contact</p>
                  <p className="text-white">{application.owner_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Owner email</p>
                  <p className="text-white">{application.contact_email}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Owner phone</p>
                  <p className="text-white">{application.contact_phone}</p>
                </div>
                {profile ? (
                  <div>
                    <p className="text-sm text-muted-foreground">Profile</p>
                    <p className="text-white">{profile.full_name ?? profile.email}</p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Active workflow metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Submitted</span>
                  <span className="text-white">{formatDateTime(application.submitted_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Updated</span>
                  <span className="text-white">{formatDateTime(application.updated_at)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Requested docs</span>
                  <span className="text-white">{documents.length}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Funding offers</CardTitle>
            </CardHeader>
            <CardContent>
              {offers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No funding offers have been created yet.</p>
              ) : (
                <div className="space-y-3">
                  {offers.map((offer) => (
                    <div key={offer.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-white">{formatCurrency(Number(offer.amount))}</p>
                        <Badge variant={offer.status === "accepted" ? "success" : offer.status === "declined" ? "destructive" : "secondary"}>
                          {offer.status.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{offer.repayment_frequency ?? "Term unknown"}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Underwriting history</CardTitle>
          </CardHeader>
          <CardContent>
            {underwritingReviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">No underwriting reviews recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {underwritingReviews.map((review) => (
                  <div key={review.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-white">{review.status.replaceAll("_", " ")}</p>
                      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{formatDateTime(review.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{review.funding_recommendation ?? "No recommendation text available."}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lender routing history</CardTitle>
          </CardHeader>
          <CardContent>
            {lenderMatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lender routing activity recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {lenderMatches.map((match) => (
                  <div key={match.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-white">{match.status.replaceAll("_", " ")}</p>
                      <span className="text-xs text-muted-foreground">{formatDateTime(match.created_at)}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">Match score: {match.match_score ?? "N/A"}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Uploaded documents</CardTitle>
          </CardHeader>
          <CardContent>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No document records found for this application.</p>
            ) : (
              <div className="space-y-3">
                {documents.map((document) => (
                  <div key={document.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{document.document_type}</p>
                      <Badge variant={document.status === "verified" ? "success" : document.status === "uploaded" ? "warning" : "secondary"}>
                        {document.status}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{document.file_name ?? "No file recorded"}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No CRM activity has been logged yet.</p>
            ) : (
              <div className="space-y-3">
                {activities.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">{activity.subject}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">{activity.activity_type.replaceAll("_", " ")}</p>
                    {activity.body ? <p className="mt-2 text-sm text-muted-foreground">{activity.body}</p> : null}
                    <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(activity.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI task history</CardTitle>
        </CardHeader>
        <CardContent>
          {aiTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI tasks have executed for this application yet.</p>
          ) : (
            <div className="space-y-3">
              {aiTasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-white">{task.task_type.replaceAll("_", " ")}</p>
                    <span className="text-xs text-muted-foreground">{task.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">Started: {task.started_at ? formatDateTime(task.started_at) : "pending"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">Completed: {task.completed_at ? formatDateTime(task.completed_at) : "pending"}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-right">
        <Link href={{ pathname: "/merchants" }} className="text-sm font-medium text-primary hover:underline">
          Back to merchant pipeline
        </Link>
      </div>
    </div>
  );
}
