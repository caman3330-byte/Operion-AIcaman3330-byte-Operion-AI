import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireInternalUser } from "@/lib/auth";
import { renderOperionEmail } from "@/lib/email/templates";
import { handleRouteError } from "@/lib/errors";
import { generateTestLeads } from "@/lib/testing/lead-generator";
import { simulationLeadGenerateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const outreachPreviewSchema = simulationLeadGenerateSchema.extend({
  sample_size: z.number().int().min(1).max(12).optional().default(5)
});

export async function POST(request: NextRequest) {
  try {
    await requireInternalUser(request);
    const payload = outreachPreviewSchema.parse(await request.json());
    const generatorInput: Parameters<typeof generateTestLeads>[0] = {
      batchSize: payload.batch_size
    };
    if (payload.industries) generatorInput.industries = payload.industries;
    if (payload.seed) generatorInput.seed = payload.seed;

    const leads = generateTestLeads(generatorInput).slice(0, payload.sample_size);
    const previews = leads.map((lead, index) => {
      const merchant = renderOperionEmail({
        subject: `Private capital review for ${lead.business_name}`,
        preheader: "A concise working-capital review from Operion Capital.",
        title: "Private capital review available",
        intro: [
          `Hi ${lead.owner_name},`,
          `${lead.business_name} appears to fit working-capital programs commonly reviewed through the Operion Capital network.`,
          "Our process is secure, concise, and designed around private funding analysis and lender matching."
        ],
        sections: [
          { label: "Source", value: resolveSource(index) },
          { label: "Industry", value: lead.industry ?? "Not provided" },
          { label: "Estimated funding need", value: formatCurrency(lead.funding_need) }
        ],
        cta: { label: "Start Private Review", url: "https://operioncapital.com/apply?source=simulation" },
        footerNote:
          "Controlled internal simulation preview. No real outreach is sent from this endpoint and all generated records are synthetic.",
        brand: "capital"
      });
      const lender = renderOperionEmail({
        subject: `Matched funding preview: ${lead.business_name}`,
        preheader: "Synthetic deal-routing preview for lender workflow testing.",
        title: "Matched funding preview",
        intro: [
          "Hello Funding Desk,",
          `Operion Capital is validating a simulated lender-routing package for ${lead.business_name}.`,
          "This preview tests concise package formatting, lender positioning, and response tracking before live outbound operations."
        ],
        sections: [
          { label: "Business", value: lead.business_name },
          { label: "Industry", value: lead.industry ?? "Not provided" },
          { label: "State", value: lead.state ?? "Not provided" },
          { label: "Requested amount", value: formatCurrency(lead.funding_need) }
        ],
        footerNote:
          "Controlled internal simulation preview. No lender communication is sent from this endpoint.",
        brand: "capital"
      });

      return {
        lead: {
          source: resolveSource(index),
          business_name: lead.business_name,
          owner_name: lead.owner_name,
          email: lead.email,
          industry: lead.industry,
          state: lead.state,
          annual_revenue_est: lead.annual_revenue_est,
          funding_need: lead.funding_need,
          risk_profile: lead.risk_profile,
          simulation_only: true
        },
        merchant_email: {
          subject: merchant.subject,
          text: merchant.text,
          html: merchant.html
        },
        lender_email: {
          subject: lender.subject,
          text: lender.text,
          html: lender.html
        }
      };
    });

    return NextResponse.json({
      data: {
        ok: true,
        simulation_mode: "outreach_preview_only",
        generated: leads.length,
        source_mix: ["google_maps", "apollo", "website_scraping", "csv_import", "linkedin_enrichment"],
        previews,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function resolveSource(index: number) {
  const sources = ["google_maps", "apollo", "website_scraping", "business_directory", "csv_import", "linkedin_enrichment"];
  return sources[index % sources.length] as string;
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "Not provided";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}
