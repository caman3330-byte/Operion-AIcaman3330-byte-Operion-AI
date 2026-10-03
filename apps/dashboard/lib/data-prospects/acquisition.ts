import { createHash } from "node:crypto";
import type { RawBusinessLead } from "@/lib/acquisition/normalization";
import { normalizeImportRows } from "@/lib/acquisition/manual-import";
import { persistDataImport } from "@/lib/data-prospects/repository";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export async function findDataProspectByIdentity(identityKey: string | null) {
  if (!identityKey) return null;
  const { data, error } = await getSupabaseAdmin().from("acquisition_prospects" as never)
    .select("id").eq("identity_key" as never, identityKey as never).maybeSingle();
  if (error) throw error;
  return data as { id: string } | null;
}

/** Acquisition shares the upload identity and transactional provenance foundation. */
export async function ingestAcquiredProspects(input: {
  records: RawBusinessLead[];
  provider: string;
  requestedBy: string;
}) {
  const rawRows = input.records.map((record) => ({
    ...record,
    address: record.address ?? rawString(record.raw_payload, "formatted_address") ?? rawString(record.raw_payload, "street_address"),
    zip: record.zip ?? rawString(record.raw_payload, "postal_code"),
    source: record.source ?? input.provider
  }));
  const rows = normalizeImportRows(rawRows);
  if (rows.length === 0) return { batch_id: null, created: [], duplicates: [], failed: [] };
  const result = await persistDataImport({
    fileName: `${input.provider} acquisition`,
    contentHash: createHash("sha256").update(JSON.stringify(rawRows)).digest("hex"),
    sourceKind: "ai",
    provider: input.provider,
    uploadedBy: /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.requestedBy) ? input.requestedBy : null,
    rows
  });
  const rowByNumber = new Map(rows.map((row) => [row.row_number, row]));
  return {
    batch_id: result.batch_id,
    created: result.rows.filter((row) => row.status === "imported").map((row) => ({
      id: row.acquisition_prospect_id as string,
      business_name: rowByNumber.get(row.row_number)?.business_name ?? ""
    })),
    duplicates: result.rows.filter((row) => row.status === "duplicate").map((row) => ({
      business_name: rowByNumber.get(row.row_number)?.business_name ?? "",
      existing_prospect_id: row.acquisition_prospect_id,
      reason: "business_location_identity"
    })),
    failed: result.rows.filter((row) => row.status === "invalid").map((row) => ({
      business_name: rowByNumber.get(row.row_number)?.business_name ?? "",
      error: rowByNumber.get(row.row_number)?.errors.join("; ") || "Invalid business record"
    }))
  };
}

function rawString(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
