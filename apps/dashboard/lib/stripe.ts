import { ConfigurationError } from "@/lib/errors";
import { readServerEnv } from "@/lib/env";
import { recordApiUsage } from "@/lib/api-usage";
import { withRetry } from "@/lib/retry";

interface CreateInvoiceInput {
  lenderId: string;
  customerId: string;
  amountCents: number;
  description: string;
}

export async function createInvoice(input: CreateInvoiceInput) {
  const env = readServerEnv();
  if (!env.STRIPE_SECRET_KEY) {
    throw new ConfigurationError("STRIPE_SECRET_KEY is required to create invoices");
  }

  const startedAt = Date.now();
  const body = new URLSearchParams({
    customer: input.customerId,
    "pending_invoice_items_behavior": "include",
    auto_advance: "false",
    description: input.description
  });

  const response = await withRetry(
    async () => {
      const stripeResponse = await fetch("https://api.stripe.com/v1/invoices", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
          "content-type": "application/x-www-form-urlencoded"
        },
        body
      });

      if (!stripeResponse.ok) {
        throw new Error(`Stripe request failed with ${stripeResponse.status}`);
      }

      return stripeResponse.json() as Promise<{ id: string; status: string }>;
    },
    { operation: "stripe.createInvoice" }
  );

  await recordApiUsage({
    service: "stripe",
    operation: "create_invoice",
    estimatedCostUsd: 0,
    success: true,
    latencyMs: Date.now() - startedAt
  });

  return {
    ...response,
    lenderId: input.lenderId,
    amountCents: input.amountCents
  };
}
