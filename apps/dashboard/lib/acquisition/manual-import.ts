import * as XLSX from "xlsx";
import { buildProspectIdentity, normalizeBusinessLead } from "@/lib/acquisition/normalization";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5_000;
const PREVIEW_ROWS = 100;

export type ImportRowStatus = "valid" | "invalid" | "duplicate";

export type ManualImportRow = {
  row_number: number;
  status: ImportRowStatus;
  duplicate_reason: string | null;
  errors: string[];
  missing_email: boolean;
  missing_phone: boolean;
  business_name: string;
  normalized_business_name: string;
  normalized_address: string;
  normalized_city: string;
  normalized_state: string;
  normalized_zip: string;
  identity_key: string | null;
  industry: string | null;
  owner_name: string | null;
  raw_payload: Record<string, unknown>;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website_url: string | null;
  domain: string | null;
  phone: string | null;
  email: string | null;
};

export type ManualImportPreview = {
  sheet_name: string;
  columns: string[];
  counts: {
    total: number;
    valid: number;
    duplicate: number;
    invalid: number;
    missing_email: number;
    missing_phone: number;
    ready_for_outreach: number;
  };
  rows: ManualImportRow[];
};

type SpreadsheetRow = Record<string, unknown>;

const columnAliases: Record<string, string[]> = {
  business_name: ["business name", "company", "company name", "business", "name"],
  owner_name: ["owner name", "owner", "business owner", "owner full name", "contact name"],
  address: ["address", "street", "street address", "business address"],
  city: ["city", "town"],
  state: ["state", "province", "region"],
  zip: ["zip", "zip code", "postal code", "postcode"],
  website_url: ["website", "website url", "url", "domain"],
  phone: ["phone", "phone number", "business phone", "telephone"],
  email: ["email", "email address", "business email", "contact email"],
  industry: ["industry", "business industry", "category"]
};

export function previewManualImport(fileName: string, contents: ArrayBuffer | Uint8Array): ManualImportPreview {
  const parsed = parseManualImport(fileName, contents);
  return { ...parsed, rows: parsed.rows.slice(0, PREVIEW_ROWS) };
}

/** Import confirmation reparses the original file; never persist the capped preview. */
export function parseManualImport(fileName: string, contents: ArrayBuffer | Uint8Array): ManualImportPreview {
  const bytes = contents instanceof Uint8Array ? contents : new Uint8Array(contents);
  if (bytes.byteLength === 0) throw new ManualImportError("The upload is empty.");
  if (bytes.byteLength > MAX_FILE_BYTES) throw new ManualImportError("Uploads must be 5 MB or smaller.");
  if (!/\.(csv|xlsx)$/i.test(fileName)) throw new ManualImportError("Upload a CSV or XLSX file.");

  let workbook: XLSX.WorkBook;
  try {
    // raw preserves CSV postal codes such as 02108; formatted XLSX cell text is read below.
    workbook = XLSX.read(bytes, { type: "array", raw: true, dense: true });
  } catch {
    throw new ManualImportError("The file could not be read. Upload a valid CSV or XLSX file.");
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new ManualImportError("The workbook has no worksheet.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new ManualImportError("The worksheet could not be read.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false, blankrows: false });
  const firstRow = (matrix[0] ?? []).map((value) => stringValue(value));
  const hasRecognizedHeader = firstRow.some((value) => Object.values(columnAliases).flat().includes(normalizeHeading(value)));
  const rows = hasRecognizedHeader
    ? matrixToRecords(matrix)
    : matrix.map((row) => positionalRow(row));
  if (rows.length === 0) throw new ManualImportError("The worksheet has no data rows.");
  if (rows.length > MAX_ROWS) throw new ManualImportError(`Uploads are limited to ${MAX_ROWS.toLocaleString()} rows.`);

  const columns = Object.keys(rows[0] ?? {});
  const mappedColumns = mapColumns(columns);
  if (!mappedColumns.business_name) throw new ManualImportError("A Business Name column is required.");

  const seen = new Map<string, string>();
  const output = rows.map((row, index) => normalizeRow(row, typeof row.__rowNum__ === "number" ? row.__rowNum__ + 1 : index + 2, mappedColumns, seen));
  const counts = {
    total: output.length,
    valid: output.filter((row) => row.status === "valid").length,
    duplicate: output.filter((row) => row.status === "duplicate").length,
    invalid: output.filter((row) => row.status === "invalid").length,
    missing_email: output.filter((row) => row.missing_email).length,
    missing_phone: output.filter((row) => row.missing_phone).length,
    ready_for_outreach: output.filter((row) => row.status === "valid" && Boolean(row.email)).length
  };

  return { sheet_name: sheetName, columns, counts, rows: output };
}

export function normalizeImportRows(rows: SpreadsheetRow[]): ManualImportRow[] {
  const columns = mapColumns([...new Set(rows.flatMap((row) => Object.keys(row)))]);
  const seen = new Map<string, string>();
  return rows.map((row, index) => normalizeRow(row, index + 1, columns, seen));
}

function normalizeRow(row: SpreadsheetRow, rowNumber: number, columns: Record<string, string | undefined>, seen: Map<string, string>): ManualImportRow {
  const value = (field: string) => columns[field] ? stringValue(row[columns[field] as string]) : "";
  const businessName = value("business_name");
  const address = compact(value("address"));
  const city = compact(value("city"));
  const state = compact(value("state"))?.toUpperCase() ?? null;
  const zip = normalizeZip(value("zip"));
  const normalized = normalizeBusinessLead({
    business_name: businessName,
    website_url: value("website_url"),
    phone: value("phone"),
    email: value("email"),
    city,
    state,
    source: "manual_upload",
    raw_payload: row
  });
  const errors: string[] = [];
  if (!normalized.business_name || normalized.normalized_business_name.length < 2) errors.push("Business Name is required.");
  if (value("website_url") && !normalized.website_url) errors.push("Website is not a valid URL.");
  if (value("email") && (!normalized.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email))) errors.push("Email is not valid.");
  if (value("phone") && (!normalized.phone || normalized.phone.replace(/\D/g, "").length > 15)) errors.push("Phone is not valid.");

  const identity = buildProspectIdentity({ business_name: businessName, address, city: normalized.city, state: normalized.state, zip });
  const duplicateKey = identity.identity_key && seen.has(identity.identity_key) ? identity.identity_key : null;
  if (!duplicateKey && !errors.length && identity.identity_key) seen.set(identity.identity_key, String(rowNumber));

  const rawPayload: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(row)) {
    const v = val === null || val === undefined ? "" : String(val);
    rawPayload[key] = v;
  }

  return {
    row_number: rowNumber,
    status: errors.length ? "invalid" : duplicateKey ? "duplicate" : "valid",
    duplicate_reason: duplicateKey ? `business_location: row ${seen.get(duplicateKey)}` : null,
    errors,
    missing_email: !normalized.email,
    missing_phone: !normalized.phone,
    business_name: normalized.business_name,
    ...identity,
    industry: compact(value("industry")),
    owner_name: compact(value("owner_name")),
    raw_payload: rawPayload,
    address,
    city: normalized.city,
    state: normalized.state,
    zip,
    website_url: normalized.website_url,
    domain: normalized.domain,
    phone: normalized.phone,
    email: normalized.email
  };
}

function matrixToRecords(matrix: unknown[][]): SpreadsheetRow[] {
  const headers = (matrix[0] ?? []).map((value, index) => {
    const heading = stringValue(value).trim();
    return heading || `__empty_${index}`;
  });
  return matrix.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function positionalRow(row: unknown[]): SpreadsheetRow {
  // The supplied business list is a common registry export with no header row:
  // first name, last name, business name, street, city, state, ZIP, followed by
  // a repeated mailing address. Keep the mailing fields in raw_payload while
  // using the physical business address for identity and enrichment.
  if (row.length >= 11) {
    return {
      owner_name: [row[0], row[1]].map(stringValue).map((value) => value.trim()).filter(Boolean).join(" "),
      business_name: row[2] ?? "",
      address: row[3] ?? "",
      city: row[4] ?? "",
      state: row[5] ?? "",
      zip: row[6] ?? "",
      mailing_address: row[7] ?? "",
      mailing_city: row[8] ?? "",
      mailing_state: row[9] ?? "",
      mailing_zip: row[10] ?? ""
    };
  }

  const fields = ["business_name", "address", "city", "state", "zip", "address_2", "city_2", "state_2", "zip_2", "owner_name"];
  return Object.fromEntries(fields.map((field, index) => [field, row[index] ?? ""]));
}

function mapColumns(columns: string[]) {
  const normalized = new Map(columns.map((column) => [normalizeHeading(column), column]));
  return Object.fromEntries(Object.entries(columnAliases).map(([field, aliases]) => [field, aliases.map(normalizeHeading).map((alias) => normalized.get(alias)).find(Boolean)]));
}

function normalizeHeading(value: string) { return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function compact(value: string) { const output = value.trim().replace(/\s+/g, " "); return output || null; }
function normalizeZip(value: string) { const output = value.trim().replace(/\s+/g, ""); return /^[0-9]{5}(?:-[0-9]{4})?$/.test(output) ? output : output || null; }
function stringValue(value: unknown) { return value === null || value === undefined ? "" : String(value); }

export class ManualImportError extends Error {}
