import { normalizeBusinessLead, type RawBusinessLead } from "@/lib/acquisition/normalization";

export interface DeduplicationResult {
  unique: RawBusinessLead[];
  duplicates: Array<{ business_name: string; reason: string }>;
}

export function deduplicateAcquisitionRecords(records: RawBusinessLead[]): DeduplicationResult {
  const unique: RawBusinessLead[] = [];
  const duplicates: Array<{ business_name: string; reason: string }> = [];
  const seenDomains = new Set<string>();
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  const seenNames: string[] = [];

  for (const record of records) {
    const normalized = normalizeBusinessLead(record);
    const reason =
      (normalized.domain && seenDomains.has(normalized.domain) ? "domain" : null)
      ?? (normalized.email && seenEmails.has(normalized.email) ? "email" : null)
      ?? (normalized.phone && seenPhones.has(normalized.phone) ? "phone" : null)
      ?? (seenNames.some((name) => similarName(name, normalized.normalized_business_name)) ? "company_name_similarity" : null);

    if (reason) {
      duplicates.push({ business_name: normalized.business_name, reason });
      continue;
    }

    unique.push(record);
    if (normalized.domain) seenDomains.add(normalized.domain);
    if (normalized.email) seenEmails.add(normalized.email);
    if (normalized.phone) seenPhones.add(normalized.phone);
    if (normalized.normalized_business_name) seenNames.push(normalized.normalized_business_name);
  }

  return { unique, duplicates };
}

function similarName(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 && intersection / union >= 0.8;
}
