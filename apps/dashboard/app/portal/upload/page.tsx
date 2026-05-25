import { FileCheck2, LockKeyhole, ShieldCheck } from "lucide-react";
import { DocumentUploadForm } from "@/components/application/document-upload-form";
import { OperionLogo } from "@/components/brand/operion-logo";
import { UploadLinkRequestForm } from "@/components/portal/upload-link-request-form";
import { Badge } from "@/components/ui/badge";
import { validateMerchantUploadToken } from "@/lib/portal/merchant-upload-auth";
import { productionRepository } from "@/lib/repositories/production";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MerchantUploadPortalPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const session = token ? await validatePortalSession(token) : null;

  if (!session) {
    return (
      <main className="capital-cinematic min-h-screen text-foreground">
        <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <section className="min-w-0">
            <OperionLogo size="lg" collapseWordmarkOnMobile />
            <div className="mt-10">
              <Badge variant="outline">Secure upload link</Badge>
            </div>
            <h1 className="mt-6 max-w-full font-serif text-3xl font-medium leading-tight tracking-normal text-white sm:max-w-2xl sm:text-5xl">
              Secure statement upload
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted-foreground">
              Upload recent business bank statements through encrypted, signed-access handling. Existing links expire automatically and every
              upload is attached to your private capital review file.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                ["256-bit encrypted uploads", "private storage path"],
                ["Signed access only", "short-lived URLs"],
              ["Private capital review", "secure statement handling"]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-primary/15 bg-black/30 p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                </div>
              ))}
            </div>
          </section>
          <UploadLinkRequestForm />
        </div>
      </main>
    );
  }

  const documents = await productionRepository.listDocumentsForApplication(session.application.id);

  return (
    <main className="capital-cinematic min-h-screen text-foreground">
      <div className="mx-auto w-full max-w-6xl px-5 py-8">
        <div className="mb-6 flex flex-col gap-5 rounded-lg border border-primary/15 bg-black/35 p-6 shadow-2xl shadow-black/20 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <OperionLogo size="md" collapseWordmarkOnMobile />
              <Badge variant="success">Secure session active</Badge>
            </div>
            <h1 className="mt-4 font-serif text-3xl font-medium tracking-normal text-white">{session.application.business_name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Requested amount: {formatCurrency(Number(session.application.requested_amount))} / Status: {session.application.status.replaceAll("_", " ")}
            </p>
          </div>
          <div className="grid gap-2 text-sm text-muted-foreground sm:text-right">
            <span className="inline-flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-primary" />
              Magic-link authenticated
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Signed document access only
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Private operational review
            </span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
          <section className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/10 p-5">
              <h2 className="font-semibold text-white">Upload progress</h2>
              <div className="mt-5 space-y-3">
                {[
                  ["1", "Secure link verified", true],
                  ["2", "Upload bank statements", false],
                  ["3", "Funding review begins", false],
                  ["4", "Lender matching updates", false]
                ].map(([step, label, complete]) => (
                  <div key={String(label)} className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${complete ? "bg-primary text-primary-foreground" : "bg-white/10 text-muted-foreground"}`}>
                      {step}
                    </span>
                    <span className="text-sm text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-card/80 p-5">
              <div className="flex items-center gap-3">
                <FileCheck2 className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-white">Document checklist</h2>
              </div>
              <div className="mt-5 space-y-3 text-sm text-muted-foreground">
                <p>Required: latest business bank statements</p>
                <p>Optional: processing statements</p>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-card/80 p-5">
              <h2 className="font-semibold text-white">Security</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Files are stored in private Supabase Storage buckets. Operators can view documents only through short-lived signed URLs,
                and document records are prepared for future OCR, NSF detection, revenue analysis, and funding review automation.
              </p>
            </div>
          </section>

          <DocumentUploadForm applicationId={session.application.id} documents={documents} merchantToken={token!} variant="portal" />
        </div>
      </div>
    </main>
  );
}

async function validatePortalSession(token: string) {
  try {
    return await validateMerchantUploadToken(token);
  } catch {
    return null;
  }
}
