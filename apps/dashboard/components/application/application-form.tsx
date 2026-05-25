"use client";

import { useMemo, useRef, useState, useTransition, type RefObject } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, LockKeyhole, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const steps = [
  { title: "Business", description: "Company profile" },
  { title: "Capital", description: "Amount and revenue" },
  { title: "Owner", description: "Contact details" },
  { title: "Statements", description: "Required upload" }
];

export function ApplicationForm() {
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [secureUploadUrl, setSecureUploadUrl] = useState<string | null>(null);
  const [bankStatementFiles, setBankStatementFiles] = useState<File[]>([]);
  const [processingStatementFiles, setProcessingStatementFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "complete" | "needs_link">("idle");
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bankInputRef = useRef<HTMLInputElement | null>(null);
  const processingInputRef = useRef<HTMLInputElement | null>(null);
  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);
  const currentStep = steps[step] ?? steps[0]!;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setUploadMessage(null);

    if (bankStatementFiles.length === 0) {
      setStep(3);
      setMessage("Latest business bank statements are required before submitting.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const optionalNumber = (name: string) => {
      const raw = formData.get(name);
      return raw === null || String(raw).trim() === "" ? null : Number(raw);
    };
    const monthlyRevenue = Number(formData.get("monthly_revenue") ?? 0);
    const payload = {
      business_name: String(formData.get("business_name") ?? ""),
      industry: String(formData.get("industry") ?? ""),
      business_address: String(formData.get("business_address") ?? "") || null,
      time_in_business_months: optionalNumber("time_in_business_months"),
      tax_id_last4: String(formData.get("ein") ?? "") || null,
      state: null,
      website_url: null,
      annual_revenue: Number.isFinite(monthlyRevenue) && monthlyRevenue > 0 ? monthlyRevenue * 12 : null,
      monthly_revenue: monthlyRevenue,
      monthly_deposits: monthlyRevenue,
      requested_amount: Number(formData.get("requested_amount") ?? 0),
      credit_score_range: "unknown",
      owner_name: String(formData.get("owner_name") ?? ""),
      contact_email: String(formData.get("contact_email") ?? ""),
      contact_phone: String(formData.get("contact_phone") ?? ""),
      ownership_percentage: null,
      bank_name: null,
      average_daily_balance: null,
      funding_purpose: String(formData.get("funding_purpose") ?? ""),
      product_type: "mca",
      consent_to_contact: true
    };

    startTransition(async () => {
      try {
        const response = await fetch("/api/applications", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) {
          setMessage(result.error?.message ?? "Unable to submit application.");
          return;
        }

        const applicationId = result.data?.application?.id as string | undefined;
        const uploadUrl = typeof result.data?.secure_upload_url === "string" ? result.data.secure_upload_url : null;
        setSecureUploadUrl(uploadUrl);

        if (applicationId && uploadUrl) {
          const token = new URL(uploadUrl).searchParams.get("token");
          if (token) {
            setUploadStatus("uploading");
            await uploadSelectedDocuments(applicationId, token, "bank_statements", bankStatementFiles);
            if (processingStatementFiles.length > 0) {
              await uploadSelectedDocuments(applicationId, token, "processing_statements", processingStatementFiles);
            }
            setUploadStatus("complete");
            setUploadMessage("Your application and statements were received. Operion Capital will continue private funding review by email.");
          } else {
            setUploadStatus("needs_link");
            setUploadMessage("Your application was received. Use the secure upload link sent by email to finish document submission.");
          }
        } else {
          setUploadStatus("needs_link");
          setUploadMessage("Your application was received. A funding specialist will request documents by secure upload link if needed.");
        }

        form.reset();
        setBankStatementFiles([]);
        setProcessingStatementFiles([]);
        setSubmitted(true);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to submit application.");
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-lg border border-primary/20 bg-black/35 p-9 text-center shadow-2xl shadow-black/20">
        <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
        <h2 className="mt-4 font-serif text-2xl font-medium tracking-normal text-white">Application received</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Operion Capital has your funding request. Updates are handled by secure email and direct funding-team follow-up. No
          merchant dashboard or portal login is required.
        </p>
        {uploadStatus === "complete" ? (
          <p className="mx-auto mt-4 max-w-md rounded-md border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
            Bank statements received for private capital review.
          </p>
        ) : null}
        {uploadMessage ? <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">{uploadMessage}</p> : null}
        {secureUploadUrl && uploadStatus !== "complete" ? (
          <Button asChild className="mt-5">
            <a href={secureUploadUrl}>
              Upload secure documents
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form className="rounded-lg border border-primary/15 bg-black/35 p-6 shadow-2xl shadow-black/20 backdrop-blur" onSubmit={handleSubmit} noValidate>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">Secure application</p>
            <h2 className="mt-1 font-serif text-2xl font-medium tracking-normal text-white">{currentStep.title}</h2>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5 text-primary" />
            Encrypted
          </div>
        </div>
        <div className="mt-5 h-1.5 rounded-full bg-white/10">
          <div className="h-1.5 rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {steps.map((item, index) => (
            <button
              key={item.title}
              type="button"
              onClick={() => setStep(index)}
              className={cn(
                "rounded-md border border-primary/15 px-3 py-2 text-left transition",
                index === step ? "bg-primary/12 text-primary" : "bg-white/[0.02] text-muted-foreground hover:bg-primary/[0.06]"
              )}
            >
              <span className="block text-xs font-semibold">{item.title}</span>
              <span className="mt-1 block text-xs">{item.description}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={cn("grid gap-5 md:grid-cols-2", step !== 0 && "hidden")}>
        <Field label="Business name" name="business_name" required />
        <div className="space-y-2">
          <Label htmlFor="industry">Industry</Label>
          <Select id="industry" name="industry" required defaultValue="">
            <option value="" disabled>
              Select industry
            </option>
            <option value="trucking">Trucking</option>
            <option value="logistics">Logistics</option>
            <option value="construction">Construction</option>
            <option value="ecommerce">Ecommerce</option>
            <option value="restaurants">Restaurants</option>
            <option value="retail">Retail</option>
            <option value="healthcare">Healthcare</option>
            <option value="manufacturing">Manufacturing</option>
            <option value="other">Other</option>
          </Select>
        </div>
        <Field label="EIN" name="ein" placeholder="XX-XXXXXXX" required />
        <Field label="Time in business (months)" name="time_in_business_months" type="number" min="0" required />
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="business_address">Business address</Label>
          <Textarea id="business_address" name="business_address" placeholder="Street, city, state, ZIP" required />
        </div>
      </div>

      <div className={cn("grid gap-5 md:grid-cols-2", step !== 1 && "hidden")}>
        <Field label="Requested amount" name="requested_amount" type="number" min="1" required />
        <Field label="Estimated monthly revenue" name="monthly_revenue" type="number" min="0" required />
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="funding_purpose">Funding purpose</Label>
          <Textarea id="funding_purpose" name="funding_purpose" placeholder="Inventory, payroll, expansion, equipment, cash flow..." />
        </div>
      </div>

      <div className={cn("grid gap-5 md:grid-cols-2", step !== 2 && "hidden")}>
        <Field label="Owner name" name="owner_name" required />
        <Field label="Business email" name="contact_email" type="email" required />
        <Field label="Phone number" name="contact_phone" required />
      </div>

      <div className={cn("grid gap-5", step !== 3 && "hidden")}>
        <DocumentPicker
          title="Latest business bank statements"
          description="Required. Upload recent business bank statements so the file can move into private capital review."
          files={bankStatementFiles}
          required
          inputRef={bankInputRef}
          onChange={setBankStatementFiles}
        />
        <DocumentPicker
          title="Processing statements"
          description="Optional. Upload processing statements if card or processor volume is part of the funding profile."
          files={processingStatementFiles}
          inputRef={processingInputRef}
          onChange={setProcessingStatementFiles}
        />
        {uploadStatus === "uploading" ? (
          <div className="rounded-lg border border-primary/20 bg-primary/10 p-4 text-sm text-primary">Uploading statements securely...</div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 pt-5">
        <Button type="button" variant="outline" disabled={step === 0 || isPending} onClick={() => setStep((value) => Math.max(0, value - 1))}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" disabled={isPending} onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={isPending}>
            {isPending ? "Submitting" : "Submit securely"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
      {message ? <p className="mt-4 text-sm text-destructive">{message}</p> : null}
    </form>
  );
}

function Field({ label, name, type = "text", ...props }: { label: string; name: string; type?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} {...props} />
    </div>
  );
}

function DocumentPicker({
  title,
  description,
  files,
  inputRef,
  onChange,
  required = false
}: {
  title: string;
  description: string;
  files: File[];
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (files: File[]) => void;
  required?: boolean;
}) {
  return (
    <div className="rounded-lg border border-primary/15 bg-white/[0.025] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">
            {title} {required ? <span className="text-primary">*</span> : null}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <UploadCloud className="h-4 w-4" />
          Choose files
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        required={required}
        onChange={(event) => onChange(Array.from(event.target.files ?? []))}
        accept="application/pdf,image/png,image/jpeg,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      />
      {files.length > 0 ? (
        <div className="mt-4 space-y-2">
          {files.map((file) => (
            <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/25 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate text-sm text-white">{file.name}</span>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((item) => item !== file))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-xs text-muted-foreground">
          PDF, PNG, JPG, XLS, or XLSX up to 50MB each.
        </p>
      )}
    </div>
  );
}

async function uploadSelectedDocuments(applicationId: string, token: string, documentType: "bank_statements" | "processing_statements", files: File[]) {
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("document_type", documentType);
    formData.append("business_application_id", applicationId);
    formData.append("merchant_token", token);

    const response = await fetch("/api/documents/upload", {
      method: "POST",
      body: formData
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error?.message ?? "Document upload failed.");
    }
  }
}
