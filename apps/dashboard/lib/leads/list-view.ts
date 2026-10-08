import type { Lead, LeadStatus, LeadTier } from "@operion/shared";

export function buildLeadListView(
  leads: Lead[],
  filters: { query: string; status: LeadStatus | "all"; tier: LeadTier | "all"; page: number; pageSize?: number }
) {
  const query = filters.query.trim().toLowerCase();
  const matching = leads.filter((lead) =>
    (!query || [lead.id, lead.business_name, lead.contact_name, lead.email, lead.phone, lead.industry, lead.state]
      .some((value) => typeof value === "string" && value.toLowerCase().includes(query))) &&
    (filters.status === "all" || lead.status === filters.status) &&
    (filters.tier === "all" || lead.tier === filters.tier)
  );
  const pageSize = filters.pageSize ?? 25;
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number.isFinite(filters.page) ? Math.trunc(filters.page) : 1));
  const offset = (page - 1) * pageSize;
  return { rows: matching.slice(offset, offset + pageSize), total: matching.length, page, pageCount, first: matching.length ? offset + 1 : 0, last: Math.min(offset + pageSize, matching.length) };
}
