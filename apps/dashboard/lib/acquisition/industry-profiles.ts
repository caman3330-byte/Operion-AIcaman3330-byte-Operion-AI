export const mcaIndustryProfiles = [
  { key: "roofing", label: "Roofing", keywords: ["roofing", "roofer", "roof contractor"] },
  { key: "hvac", label: "HVAC", keywords: ["hvac", "air conditioning", "heating and cooling"] },
  { key: "plumbing", label: "Plumbing", keywords: ["plumbing", "plumber"] },
  { key: "electrical", label: "Electrical", keywords: ["electrical", "electrician"] },
  { key: "construction", label: "Construction", keywords: ["construction", "contractor", "general contracting", "builder"] },
  { key: "landscaping", label: "Landscaping", keywords: ["landscaping", "landscape", "lawn care"] },
  { key: "trucking", label: "Trucking", keywords: ["trucking", "transportation", "freight", "logistics"] },
  { key: "auto_repair", label: "Auto Repair", keywords: ["auto repair", "automotive repair", "collision repair", "mechanic"] },
  { key: "restaurants", label: "Restaurants", keywords: ["restaurant", "bar and grill", "cafe", "pizzeria"] }
] as const;

export type McaIndustryProfileKey = (typeof mcaIndustryProfiles)[number]["key"];

export function identifyMcaIndustry(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = value?.toLowerCase();
    if (!text) continue;
    const profile = mcaIndustryProfiles.find((candidate) => candidate.keywords.some((keyword) => text.includes(keyword)));
    if (profile) return profile.key;
  }
  return null;
}

export function isMcaPriorityIndustry(value: string | null | undefined) {
  return Boolean(identifyMcaIndustry(value));
}
