import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { ConfigurationError, NotFoundError, ValidationError } from "@/lib/errors";
import type { ManualImportPreview, ManualImportRow } from "@/lib/acquisition/manual-import";
import type { DataBatch, DataDetail, DataImportResult, DataProspect, DataProvenance, DataRecord, DataSource, DataStatus } from "./types";

type ImportRow = {
  id: string; batch_id: string; row_number: number; status: "imported" | "duplicate" | "invalid" | "valid";
  duplicate_reason: string | null; validation_errors: string[]; normalized_payload: unknown;
  raw_payload: unknown; acquisition_prospect_id: string | null; created_at: string;
};
type DataView = DataRecord & { sources: DataSource[] };
type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };
type DataDatabase = {
  public: {
    Tables: { acquisition_prospects: Table<DataProspect>; acquisition_import_rows: Table<ImportRow>; acquisition_import_batches: Table<DataBatch> };
    Views: { data_prospect_records: { Row: DataView; Relationships: [] }; data_import_batch_summaries: { Row: DataBatch; Relationships: [] } };
    Functions: { import_data_prospects: {
      Args: { p_filename: string; p_content_sha256: string; p_source_kind: string; p_provider: string; p_uploaded_by: string | null; p_rows: ManualImportRow[] };
      Returns: DataImportResult;
    } };
  };
};

function db() { return getSupabaseAdmin() as unknown as SupabaseClient<DataDatabase>; }
function check(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
    throw new ConfigurationError("The DATA foundation migration has not been applied to this environment.", {
      migration: "packages/database/migrations/0041_data_prospect_import.sql"
    });
  }
  throw error;
}

export type DataFilters = {
  source?: DataSource; q?: string; status?: DataStatus; industry?: string; state?: string; provider?: string;
  has_email?: boolean; has_phone?: boolean; verified?: boolean; ready_for_outreach?: boolean;
  from?: string; to?: string; page: number; page_size: number;
};
const statuses: DataStatus[] = ["imported","enriching","enriched","missing_contact","verified","duplicate","ready_for_outreach"];
export function parseDataFilters(params: URLSearchParams): DataFilters {
  const page = parsePage(params.get("page"),1,1_000_000);
  const page_size = parsePage(params.get("page_size"),25,100);
  const output: DataFilters = { page, page_size };
  const source = params.get("source");
  if (source) {
    if (source !== "ai" && source !== "manual") throw new ValidationError("Invalid data source.");
    output.source = source;
  }
  const status = params.get("status");
  if (status) {
    if (!statuses.includes(status as DataStatus)) throw new ValidationError("Invalid data status.");
    output.status = status as DataStatus;
  }
  for (const field of ["q","industry","state","provider"] as const) {
    const value = params.get(field)?.trim();
    if (value && value.length > 160) throw new ValidationError(`${field} is too long.`);
    if (value) output[field] = value;
  }
  for (const field of ["has_email","has_phone","verified","ready_for_outreach"] as const) {
    const value = params.get(field);
    if (value) {
      if (value !== "true" && value !== "false") throw new ValidationError(`Invalid ${field} filter.`);
      output[field] = value === "true";
    }
  }
  for (const field of ["from","to"] as const) {
    const value = params.get(field);
    if (value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) {
        throw new ValidationError("Dates must use YYYY-MM-DD.");
      }
      output[field] = value;
    }
  }
  if (output.from && output.to && output.from > output.to) throw new ValidationError("Start date must be before end date.");
  return output;
}
function parsePage(value: string | null, fallback: number, max: number) {
  if (!value) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) throw new ValidationError("Invalid pagination.");
  return Number(value);
}
function pattern(value: string) { return `%${value.replace(/[\\%_]/g,"\\$&")}%`; }
function orValue(value: string) { return `"${value.replace(/\\/g,"\\\\").replace(/"/g,'\\"')}"`; }
function pagination(page: number, page_size: number, total: number) {
  return { page, page_size, total, total_pages: Math.ceil(total/page_size) };
}

export async function listDataRecords(filters: DataFilters) {
  let query = db().from("data_prospect_records").select("*", { count: "exact" });
  if (filters.source) query = query.contains("sources",[filters.source]);
  if (filters.status) query = query.eq("status",filters.status);
  if (filters.provider) query = query.eq("provider",filters.provider);
  if (filters.industry) query = query.ilike("industry",pattern(filters.industry));
  if (filters.state) query = query.ilike("state",filters.state.replace(/[\\%_]/g,"\\$&"));
  if (filters.q) {
    const text = orValue(pattern(filters.q));
    const phone = filters.q.replace(/\D/g, "");
    const clauses = ["business_name","address","city","phone","email"].map(field => `${field}.ilike.${text}`);
    if (phone.length >= 7) clauses.push(`phone.ilike.${orValue(pattern(phone))}`);
    query = query.or(clauses.join(","));
  }
  for (const field of ["email","phone"] as const) {
    const value = filters[field === "email" ? "has_email" : "has_phone"];
    if (value !== undefined) query = value ? query.not(field,"is",null) : query.is(field,null);
  }
  if (filters.verified !== undefined) query = query.eq("verified",filters.verified);
  if (filters.ready_for_outreach !== undefined) query = query.eq("ready_for_outreach",filters.ready_for_outreach);
  if (filters.from) query = query.gte("created_at",`${filters.from}T00:00:00.000Z`);
  if (filters.to) query = query.lt("created_at",new Date(Date.parse(filters.to)+86_400_000).toISOString());
  const offset = (filters.page-1)*filters.page_size;
  const { data, count, error } = await query.order("created_at",{ascending:false}).order("id",{ascending:false}).order("record_kind").range(offset,offset+filters.page_size-1);
  check(error);
  return { data: (data ?? []) as DataRecord[], pagination: pagination(filters.page,filters.page_size,count ?? 0) };
}

export async function getDataProspect(id: string): Promise<DataProspect> {
  const { data,error } = await db().from("acquisition_prospects").select("*").eq("id",id).maybeSingle();
  check(error);
  if (!data) throw new NotFoundError("Prospect not found.");
  return data;
}
export async function updateDataProspect(id: string, patch: Partial<DataProspect>): Promise<DataProspect> {
  const { data,error } = await db().from("acquisition_prospects").update(patch).eq("id",id).select("*").single();
  check(error);
  if (!data) throw new NotFoundError("Prospect not found.");
  return data;
}

export async function getDataDetail(id: string, kind: "prospect" | "candidate"): Promise<DataDetail> {
  const { data:record,error } = await db().from("data_prospect_records").select("*").eq("id",id).eq("record_kind",kind).maybeSingle();
  check(error);
  if (!record) throw new NotFoundError("Data record not found.");
  if (kind === "candidate") {
    const { data: candidate,error: candidateError } = await getSupabaseAdmin().from("merchant_acquisition_candidates").select("*").eq("id",id).single();
    check(candidateError);
    if (!candidate) throw new NotFoundError("Data record not found.");
    return { ...record,source_payload:candidate.raw_payload,lead_id:null,state_key:null,potential_duplicate_of_id:null,
      provenance: record.provenance.map(entry => ({ ...entry,raw_payload:candidate.raw_payload })) };
  }
  const prospect = await getDataProspect(id);
  // Page through provenance rather than silently truncating at the database row cap.
  const provenance: DataProvenance[] = [];
  for (let offset=0;;offset+=500) {
    const { data:rows,error:rowsError } = await db().from("acquisition_import_rows").select("*").eq("acquisition_prospect_id",id).order("created_at").order("id").range(offset,offset+499);
    check(rowsError);
    const batchIds = [...new Set((rows ?? []).map(row=>row.batch_id))];
    if (!batchIds.length) break;
    const { data:batches,error:batchError } = await db().from("acquisition_import_batches").select("*").in("id",batchIds);
    check(batchError);
    for (const row of rows ?? []) {
      const batch = batches?.find(item=>item.id===row.batch_id);
      if (batch) provenance.push({source:batch.source_kind,provider:batch.provider,batch_code:batch.batch_code,
        original_filename:batch.original_filename,row_number:row.row_number,created_at:row.created_at,raw_payload:row.raw_payload,status:row.status});
    }
    if ((rows?.length ?? 0)<500) break;
  }
  return { ...record,provenance:provenance.length ? provenance : record.provenance,source_payload:prospect.source_payload,
    lead_id:prospect.lead_id,state_key:prospect.state_key,potential_duplicate_of_id:prospect.potential_duplicate_of_id };
}

export async function previewDataImport(parsed: ManualImportPreview): Promise<ManualImportPreview> {
  try {
    const keys = [...new Set(parsed.rows.map(row=>row.identity_key).filter((key): key is string=>Boolean(key)))];
    const existing = new Set<string>();
    for (let offset=0;offset<keys.length;offset+=100) {
      const { data,error } = await db().from("acquisition_prospects").select("identity_key").in("identity_key",keys.slice(offset,offset+100));
      check(error); data?.forEach(row=>existing.add(row.identity_key));
    }
    const rows = parsed.rows.map(row => row.status==="valid" && row.identity_key && existing.has(row.identity_key)
      ? {...row,status:"duplicate" as const,duplicate_reason:"business_location: existing prospect"} : row);
    return {...parsed,counts:{...parsed.counts,valid:rows.filter(row=>row.status==="valid").length,
      duplicate:rows.filter(row=>row.status==="duplicate").length,
      ready_for_outreach:rows.filter(row=>row.status==="valid" && row.email).length},rows};
  } catch (error) {
    console.error('[previewDataImport] Database query failed:', error);
    throw error;
  }
}

export async function persistDataImport(input: { fileName: string; contentHash: string; sourceKind: DataSource; provider: string; uploadedBy: string | null; rows: ManualImportRow[] }): Promise<DataImportResult> {
  const { data,error } = await db().rpc("import_data_prospects",{
    p_filename:input.fileName,p_content_sha256:input.contentHash,p_source_kind:input.sourceKind,p_provider:input.provider,
    p_uploaded_by:input.uploadedBy,p_rows:input.rows
  });
  check(error);
  if (!data) throw new Error("Import did not return a batch result.");
  return data;
}

export async function listDataBatches() {
  const { data,error } = await db().from("data_import_batch_summaries").select("*").eq("source_kind","manual").order("created_at",{ascending:false}).limit(25);
  check(error); return data ?? [];
}
export async function getDataBatchRows(id: string, params: URLSearchParams) {
  const page=parsePage(params.get("page"),1,1_000_000),page_size=parsePage(params.get("page_size"),25,100);
  const { data:batch,error:batchError } = await db().from("data_import_batch_summaries").select("*").eq("id",id).maybeSingle();
  check(batchError);
  if (!batch) throw new NotFoundError("Import batch not found.");
  const offset=(page-1)*page_size;
  const { data,error,count } = await db().from("acquisition_import_rows").select("*",{count:"exact"}).eq("batch_id",id).order("row_number").range(offset,offset+page_size-1);
  check(error);
  return {data:data ?? [],batch,pagination:pagination(page,page_size,count ?? 0)};
}
