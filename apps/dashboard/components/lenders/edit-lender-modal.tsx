"use client";

import { FormEvent, type ReactNode, useState } from "react";
import { Pencil } from "lucide-react";
import type { Lender } from "@operion/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EditLenderModalProps {
  lender: Lender;
  onUpdate: (id: string, lender: Omit<Lender, "id" | "created_at">) => Promise<void>;
}

export function EditLenderModal({ lender, onUpdate }: EditLenderModalProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<Lender, "id" | "created_at">>(() => toFormState(lender));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onUpdate(lender.id, normalizePayload(form));
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update lender.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Lender</DialogTitle>
          <DialogDescription>Update lender criteria, routing readiness, pricing, and delivery configuration.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company name" htmlFor={`company-${lender.id}`}>
              <Input id={`company-${lender.id}`} value={form.company_name} onChange={(event) => setForm({ ...form, company_name: event.target.value })} required />
            </Field>
            <Field label="Contact email" htmlFor={`email-${lender.id}`}>
              <Input id={`email-${lender.id}`} type="email" value={form.contact_email ?? ""} onChange={(event) => setForm({ ...form, contact_email: event.target.value || null })} />
            </Field>
          </div>
          <Field label="Webhook URL" htmlFor={`webhook-${lender.id}`}>
            <Input id={`webhook-${lender.id}`} type="url" value={form.webhook_url ?? ""} onChange={(event) => setForm({ ...form, webhook_url: event.target.value || null })} placeholder="https://lender.example.com/webhook" />
          </Field>
          <Field label="Industries / routing preferences" htmlFor={`industries-${lender.id}`}>
            <Input id={`industries-${lender.id}`} value={form.criteria_industries?.join(", ") ?? ""} onChange={(event) => setForm({ ...form, criteria_industries: splitList(event.target.value) })} placeholder="trucking, construction, restaurants, healthcare" />
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Min revenue" htmlFor={`min-${lender.id}`}>
              <Input id={`min-${lender.id}`} type="number" min={0} value={form.criteria_min_revenue ?? ""} onChange={(event) => setForm({ ...form, criteria_min_revenue: toNumberOrNull(event.target.value) })} />
            </Field>
            <Field label="Max revenue" htmlFor={`max-${lender.id}`}>
              <Input id={`max-${lender.id}`} type="number" min={0} value={form.criteria_max_revenue ?? ""} onChange={(event) => setForm({ ...form, criteria_max_revenue: toNumberOrNull(event.target.value) })} />
            </Field>
            <Field label="Price per lead" htmlFor={`price-${lender.id}`}>
              <Input id={`price-${lender.id}`} type="number" min={0} value={form.price_per_lead ?? ""} onChange={(event) => setForm({ ...form, price_per_lead: toNumberOrNull(event.target.value) })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 accent-primary" />
              Active lender routing
            </label>
            <label className="flex items-center gap-3 rounded-md border p-3 text-sm">
              <input type="checkbox" checked={form.whitelisted} onChange={(event) => setForm({ ...form, whitelisted: event.target.checked })} className="h-4 w-4 accent-primary" />
              Whitelisted relationship
            </label>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function toFormState(lender: Lender): Omit<Lender, "id" | "created_at"> {
  return {
    company_name: lender.company_name,
    contact_email: lender.contact_email,
    webhook_url: lender.webhook_url,
    criteria_industries: lender.criteria_industries,
    criteria_min_revenue: lender.criteria_min_revenue,
    criteria_max_revenue: lender.criteria_max_revenue,
    price_per_lead: lender.price_per_lead,
    active: lender.active,
    whitelisted: lender.whitelisted
  };
}

function normalizePayload(form: Omit<Lender, "id" | "created_at">) {
  return {
    ...form,
    criteria_industries: form.criteria_industries?.map((industry) => industry.trim()).filter(Boolean) ?? null
  };
}

function splitList(value: string) {
  const parts = value.split(",").map((item) => item.trim()).filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function toNumberOrNull(value: string) {
  return value ? Number(value) : null;
}
