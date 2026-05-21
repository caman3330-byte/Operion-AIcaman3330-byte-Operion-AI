"use client";

import { FormEvent, useState } from "react";
import { Plus } from "lucide-react";
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

interface AddLenderModalProps {
  onCreate: (lender: Omit<Lender, "id" | "created_at">) => Promise<void>;
  isPending: boolean;
}

const defaultValues: Omit<Lender, "id" | "created_at"> = {
  company_name: "",
  contact_email: null,
  webhook_url: null,
  criteria_industries: null,
  criteria_min_revenue: null,
  criteria_max_revenue: null,
  price_per_lead: null,
  active: true,
  whitelisted: false
};

export function AddLenderModal({ onCreate, isPending }: AddLenderModalProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const payload = {
      ...form,
      criteria_industries:
        form.criteria_industries?.map((industry) => industry.trim()).filter(Boolean) ?? null,
      price_per_lead: form.price_per_lead ?? null,
      criteria_min_revenue: form.criteria_min_revenue ?? null,
      criteria_max_revenue: form.criteria_max_revenue ?? null
    };

    try {
      await onCreate(payload);
      setOpen(false);
      setForm(defaultValues);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save lender.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Add Lender
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Lender</DialogTitle>
          <DialogDescription>Capture lender criteria and webhook delivery details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Company name</Label>
            <Input
              id="company-name"
              value={form.company_name}
              onChange={(event) => setForm({ ...form, company_name: event.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">Contact email</Label>
            <Input
              id="contact-email"
              type="email"
              value={form.contact_email ?? ""}
              onChange={(event) => setForm({ ...form, contact_email: event.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <Input
              id="webhook-url"
              type="url"
              value={form.webhook_url ?? ""}
              onChange={(event) => setForm({ ...form, webhook_url: event.target.value || null })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="criteria-industries">Criteria industries</Label>
            <Input
              id="criteria-industries"
              value={form.criteria_industries?.join(", ") ?? ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  criteria_industries: event.target.value
                    ? event.target.value.split(",").map((industry) => industry.trim()).filter(Boolean)
                    : null
                })
              }
              placeholder="technology, healthcare, retail"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="min-revenue">Min revenue</Label>
              <Input
                id="min-revenue"
                type="number"
                value={form.criteria_min_revenue ?? ""}
                onChange={(event) => setForm({ ...form, criteria_min_revenue: event.target.value ? Number(event.target.value) : null })}
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-revenue">Max revenue</Label>
              <Input
                id="max-revenue"
                type="number"
                value={form.criteria_max_revenue ?? ""}
                onChange={(event) => setForm({ ...form, criteria_max_revenue: event.target.value ? Number(event.target.value) : null })}
                min={0}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="price">Price per lead</Label>
            <Input
              id="price"
              type="number"
              value={form.price_per_lead ?? ""}
              onChange={(event) => setForm({ ...form, price_per_lead: event.target.value ? Number(event.target.value) : null })}
              min={0}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || isPending}>
              {isSubmitting || isPending ? "Saving…" : "Save Lender"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
