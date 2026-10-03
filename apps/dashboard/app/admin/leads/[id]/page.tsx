import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocumentTypeLabel } from "@/lib/documents/processing";
import { formatDateTime } from "@/lib/utils";
import { leadsRepository } from "@/lib/repositories/leads";
import { productionRepository } from "@/lib/repositories/production";
import { DocumentViewer } from "@/components/documents/document-viewer";

export const dynamic = "force-dynamic";

export default async function AdminLeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const resolved = await params;
  const id = resolved.id;

  let detail;
  try {
    detail = await leadsRepository.getDetail(id);
  } catch (err) {
    notFound();
  }

  const { lead, outreach_history, distributions } = detail;
  const documents = lead.business_application_id ? await productionRepository.listDocumentsForApplication(lead.business_application_id) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{lead.business_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Lead overview and routing history</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{lead.status}</Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)]">
        <section className="min-w-0 space-y-4 break-words">
          <Card>
            <CardHeader><CardTitle>Recorded validation</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{lead.is_test_data || lead.simulation_run_id ? "TEST / SIMULATION: not a real production prospect" : "Not flagged as test data. This alone does not prove a real, verified business."}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {([["Business", lead.business_verified], ["Website", lead.website_verified], ["Email", lead.email_verified], ["Phone", lead.phone_verified]] as const).map(([label, verified]) => <p key={label}>{label}: {verified === true ? "Recorded as verified" : "Not verified"}</p>)}
              </div>
              <p>Last validation: {lead.validation_timestamp ? formatDateTime(lead.validation_timestamp) : "Not recorded"}</p>
              <p>{lead.validation_reason || "No validation evidence recorded."}</p>
              <p className="text-muted-foreground">These are stored validation results, not a fresh independent verification.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-muted-foreground">Contact</p>
                  <p className="text-white">{lead.contact_name ?? "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="text-white">{lead.email ?? "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="text-white">{lead.phone ?? "-"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Outreach history</CardTitle>
            </CardHeader>
            <CardContent>
              {outreach_history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No outreach recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {outreach_history.map((item: any) => (
                    <div key={item.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-white">{item.channel ?? "Outreach"}</p>
                        <span className="text-xs text-muted-foreground">{formatDateTime(item.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{item.body ?? item.status ?? "-"}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="min-w-0 space-y-4 break-words">
          <Card>
            <CardHeader>
              <CardTitle>Routing & distributions</CardTitle>
            </CardHeader>
            <CardContent>
              {distributions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No distributions recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {distributions.map((d: any) => (
                    <div key={d.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-white">{d.lender_name ?? d.lender_id ?? "Lender"}</p>
                        <span className="text-xs text-muted-foreground">{formatDateTime(d.created_at)}</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">Status: {d.status ?? "-"}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No uploaded documents for this lead.</p>
              ) : (
                <div className="space-y-3">
                  {documents.map((document) => (
                    <div key={document.id} className="rounded-lg border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-white">{getDocumentTypeLabel(document.document_type)}</p>
                        <Badge variant={document.status === "verified" ? "success" : document.status === "uploaded" ? "warning" : "secondary"}>
                          {document.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{document.file_name ?? "No file recorded"}</p>
                      {document.storage_path ? (
                        <div className="mt-3"><DocumentViewer documentId={document.id} fileName={document.file_name ?? "Document"} mimeType={document.mime_type} /></div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <details><summary className="cursor-pointer text-sm">Technical record</summary><pre className="mt-3 whitespace-pre-wrap break-all text-xs text-muted-foreground">{JSON.stringify(lead, null, 2)}</pre></details>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
