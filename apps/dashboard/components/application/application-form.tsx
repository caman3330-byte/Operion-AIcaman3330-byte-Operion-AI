"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const steps = [
  { title: "Business", description: "Company profile" },
  { title: "Funding", description: "Revenue and request" },
  { title: "Owner", description: "Contact details" },
  { title: "Banking", description: "Review readiness" }
];

export function ApplicationForm() {
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [secureUploadUrl, setSecureUploadUrl] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const progress = useMemo(() => Math.round(((step + 1) / steps.length) * 100), [step]);
  const currentStep = steps[step] ?? steps[0]!;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    const optionalNumber = (name: string) => {
      const raw = formData.get(name);
      return raw === null || String(raw).trim() === "" ? null : Number(raw);
    };
    const payload = {
      business_name: String(formData.get("business_name") ?? ""),
      industry: String(formData.get("industry") ?? ""),
      business_address: String(formData.get("business_address") ?? "") || null,
      time_in_business_months: optionalNumber("time_in_business_months"),
      tax_id_last4: String(formData.get("tax_id_last4") ?? "") || null,
      state: String(formData.get("state") ?? ""),
      website_url: String(formData.get("website_url") ?? ""),
      annual_revenue: optionalNumber("annual_revenue"),
      monthly_revenue: optionalNumber("monthly_revenue"),
      monthly_deposits: Number(formData.get("monthly_deposits") ?? 0),
      requested_amount: Number(formData.get("requested_amount") ?? 0),
      credit_score_range: String(formData.get("credit_score_range") ?? "unknown"),
      owner_name: String(formData.get("owner_name") ?? ""),
      contact_email: String(formData.get("contact_email") ?? ""),
      contact_phone: String(formData.get("contact_phone") ?? ""),
      ownership_percentage: optionalNumber("ownership_percentage"),
      bank_name: String(formData.get("bank_name") ?? ""),
      average_daily_balance: optionalNumber("average_daily_balance"),
      funding_purpose: String(formData.get("funding_purpose") ?? ""),
      product_type: String(formData.get("product_type") ?? "mca"),
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
        setSecureUploadUrl(typeof result.data?.secure_upload_url === "string" ? result.data.secure_upload_url : null);
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
          Operion Capital has your funding request. We sent a secure upload link to your email so you can continue document
          submission without creating a portal password.
        </p>
        {secureUploadUrl ? (
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
        <Field label="Business address" name="business_address" placeholder="123 Main St, City, State" />
        <Field label="Business website" name="website_url" placeholder="https://example.com" />
        <Field label="State" name="state" placeholder="NY, TX, CA..." />
      </div>

      <div className={cn("grid gap-5 md:grid-cols-2", step !== 1 && "hidden")}>
        <Field label="Annual revenue" name="annual_revenue" type="number" min="0" />
        <Field label="Monthly revenue" name="monthly_revenue" type="number" min="0" />
        <Field label="Monthly deposits" name="monthly_deposits" type="number" min="0" required />
        <Field label="Requested amount" name="requested_amount" type="number" min="1" required />
        <div className="space-y-2">
          <Label htmlFor="credit_score_range">Credit score range</Label>
          <Select id="credit_score_range" name="credit_score_range" required defaultValue="unknown">
            <option value="unknown">Prefer not to say</option>
            <option value="under_550">Under 550</option>
            <option value="550_599">550-599</option>
            <option value="600_649">600-649</option>
            <option value="650_699">650-699</option>
            <option value="700_plus">700+</option>
          </Select>
        </div>
        <Field label="Time in business (months)" name="time_in_business_months" type="number" min="0" />
        <Field label="EIN last 4" name="tax_id_last4" placeholder="1234" />
        <div className="space-y-2">
          <Label htmlFor="product_type">Funding product</Label>
          <Select id="product_type" name="product_type" defaultValue="mca">
            <option value="mca">MCA funding</option>
            <option value="business_loan">Business loan</option>
            <option value="line_of_credit">Line of credit</option>
            <option value="equipment_financing">Equipment financing</option>
            <option value="unknown">Not sure yet</option>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="funding_purpose">Funding purpose</Label>
          <Textarea id="funding_purpose" name="funding_purpose" placeholder="Inventory, payroll, expansion, equipment, cash flow..." />
        </div>
      </div>

      <div className={cn("grid gap-5 md:grid-cols-2", step !== 2 && "hidden")}>
        <Field label="Owner name" name="owner_name" required />
        <Field label="Business email" name="contact_email" type="email" required />
        <Field label="Phone number" name="contact_phone" required />
        <Field label="Ownership percentage" name="ownership_percentage" type="number" min="0" max="100" placeholder="100" />
      </div>

      <div className={cn("grid gap-5 md:grid-cols-2", step !== 3 && "hidden")}>
        <Field label="Primary bank" name="bank_name" placeholder="Bank name" />
        <Field label="Average daily balance" name="average_daily_balance" type="number" min="0" />
        <div className="rounded-lg border border-primary/15 bg-white/[0.025] p-4 md:col-span-2">
          <p className="text-sm font-semibold text-white">Document upload queue</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Bank statement upload and bank-link verification are staged in the secure document workflow. After submission, you can upload statements in your customer portal.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 pt-5">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={isPending}>
            {isPending ? "Submitting" : "Submit application"}
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
