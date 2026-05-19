import { logger } from "@/lib/logger";
import { readServerEnv } from "@/lib/env";
import { recordApiUsage } from "@/lib/api-usage";
import { safeIntegrationCall } from "@/lib/runtime/integration-guards";
import { withRetry } from "@/lib/retry";

interface CreateInvoiceInput {
  lenderId: string;
  customerId: string;
  amountCents: number;
  description: string;
}

export interface CreateInvoiceResult {
  id: string;
  status: string;
  lenderId: string;
  amountCents: number;
  reason?: string;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const fallback: CreateInvoiceResult = {
    id: "",
    status: "skipped",
    lenderId: input.lenderId,
    amountCents: input.amountCents,
    reason: "stripe_not_configured"
  };

  return safeIntegrationCall<CreateInvoiceResult>(
    "stripe",
    async () => {
      const env = readServerEnv();
      const startedAt = Date.now();
      const body = new URLSearchParams({
        customer: input.customerId,
        pending_invoice_items_behavior: "include",
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
            const text = await stripeResponse.text();
            throw new Error(`Stripe request failed with ${stripeResponse.status}: ${text.slice(0, 320)}`);
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
    },
    fallback
  ).then((result) => {
    if (!result) {
      logger.warn("stripe_invoice_fallback_used", { lenderId: input.lenderId, amountCents: input.amountCents });
      return fallback;
    }

    return result;
  });
}
