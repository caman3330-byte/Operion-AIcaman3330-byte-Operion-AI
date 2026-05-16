import Link from "next/link";
import { ArrowRight, Mail, MessageSquare, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/marketing/public-shell";
import { SectionHeading } from "@/components/marketing/section-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ContactPage() {
  return (
    <PublicShell>
      <main className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <SectionHeading
              eyebrow="Contact"
              title="Talk with Operion Capital about your funding path."
              description="Send a funding question, partnership inquiry, or application-support request. The fastest way to begin is still the secure application."
            />
            <div className="mt-8 grid gap-3">
              {[
                [Mail, "Application support", "Support for business owners completing a funding request."],
                [MessageSquare, "Partner inquiries", "Lender and fintech partnership conversations."],
                [ShieldCheck, "Security-minded intake", "Contact details are handled through protected platform architecture."]
              ].map(([Icon, title, text]) => {
                const ItemIcon = Icon as typeof Mail;
                return (
                  <div key={String(title)} className="rounded-lg border border-white/10 bg-card/80 p-4">
                    <div className="flex items-start gap-3">
                      <ItemIcon className="mt-0.5 h-5 w-5 text-primary" />
                      <div>
                        <p className="font-semibold text-white">{title as string}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{text as string}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <form className="rounded-lg border border-white/10 bg-card/80 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" name="name" />
              <Field label="Business email" name="email" type="email" />
              <Field label="Company" name="company" />
              <Field label="Phone" name="phone" />
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="message">Message</Label>
                <Textarea id="message" name="message" placeholder="Tell us what you are looking for." />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button asChild>
                <a href="mailto:funding@operioncapital.com">
                  Email funding team
                  <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild variant="outline">
                <Link href="/apply">
                  Start application
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Contact form delivery is prepared for production email automation; until enabled, use email or the secure
              application flow for live intake.
            </p>
          </form>
        </div>
      </main>
    </PublicShell>
  );
}

function Field({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} />
    </div>
  );
}
