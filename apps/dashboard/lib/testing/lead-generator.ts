import type { Json } from "@operion/shared";
import type { RawBusinessLead } from "@/lib/acquisition/normalization";

export type SimulationIndustry =
  | "trucking"
  | "logistics"
  | "construction"
  | "ecommerce"
  | "restaurants"
  | "retail"
  | "healthcare"
  | "manufacturing";

export type RiskProfile = "low" | "medium" | "high" | "watchlist";

export interface GeneratedTestLead extends RawBusinessLead {
  owner_name: string;
  funding_need: number;
  risk_profile: RiskProfile;
  raw_payload: Json;
}

export interface GenerateTestLeadsInput {
  batchSize: 10 | 100 | 1000 | 10000;
  industries?: SimulationIndustry[];
  seed?: string | undefined;
}

const industries: SimulationIndustry[] = [
  "trucking",
  "logistics",
  "construction",
  "ecommerce",
  "restaurants",
  "retail",
  "healthcare",
  "manufacturing"
];

const industryWords: Record<SimulationIndustry, string[]> = {
  trucking: ["Freight", "Haul", "Transport", "Carrier", "Fleet"],
  logistics: ["Logistics", "Supply", "Route", "Fulfillment", "Freight"],
  construction: ["Build", "Concrete", "Roofing", "Contracting", "Site"],
  ecommerce: ["Direct", "Marketplace", "Commerce", "Brands", "Shop"],
  restaurants: ["Kitchen", "Grill", "Cafe", "Bistro", "Hospitality"],
  retail: ["Retail", "Outlet", "Market", "Goods", "Store"],
  healthcare: ["Care", "Clinic", "Wellness", "Medical", "Health"],
  manufacturing: ["Fabrication", "Manufacturing", "Works", "Industrial", "Products"]
};

const prefixes = ["Apex", "Summit", "Keystone", "Prime", "Metro", "Northstar", "Blue Ridge", "Pioneer", "Vertex", "Crest"];
const suffixes = ["Group", "Co", "Partners", "Solutions", "Services", "Holdings", "Enterprises", "Company"];
const firstNames = ["Jordan", "Morgan", "Taylor", "Casey", "Avery", "Riley", "Parker", "Drew", "Cameron", "Quinn"];
const lastNames = ["Walker", "Patel", "Hernandez", "Brooks", "Nguyen", "Carter", "Kim", "Singh", "Morris", "Reed"];
const states = ["TX", "FL", "CA", "GA", "NY", "IL", "NC", "OH", "PA", "AZ", "NJ", "MI"];

const revenueRanges: Record<SimulationIndustry, [number, number]> = {
  trucking: [250_000, 5_000_000],
  logistics: [400_000, 8_000_000],
  construction: [300_000, 6_000_000],
  ecommerce: [150_000, 4_000_000],
  restaurants: [180_000, 3_000_000],
  retail: [150_000, 3_500_000],
  healthcare: [250_000, 7_500_000],
  manufacturing: [500_000, 12_000_000]
};

export function generateTestLeads(input: GenerateTestLeadsInput): GeneratedTestLead[] {
  const selectedIndustries = input.industries?.length ? input.industries : industries;
  const random = createSeededRandom(input.seed ?? `operion-${Date.now()}-${input.batchSize}`);

  return Array.from({ length: input.batchSize }, (_, index) => {
    const industry = pick(selectedIndustries, random);
    const owner = `${pick(firstNames, random)} ${pick(lastNames, random)}`;
    const businessName = `${pick(prefixes, random)} ${pick(industryWords[industry], random)} ${pick(suffixes, random)}`;
    const domain = toDomain(businessName, index);
    const [minRevenue, maxRevenue] = revenueRanges[industry];
    const revenue = rounded(randomBetween(minRevenue, maxRevenue, random), 5000);
    const fundingNeed = rounded(Math.max(15_000, revenue * randomBetween(0.04, 0.22, random)), 1000);
    const riskProfile = resolveRiskProfile(industry, revenue, fundingNeed, random);
    const phone = `+1${randomInt(200, 989, random)}${randomInt(200, 999, random)}${randomInt(1000, 9999, random)}`;

    return {
      source_record_id: `sim-${index + 1}`,
      business_name: businessName,
      contact_name: owner,
      owner_name: owner,
      email: `${owner.toLowerCase().replace(/[^a-z]/g, ".")}@${domain}`,
      phone,
      website_url: `https://${domain}`,
      industry,
      state: pick(states, random),
      annual_revenue_est: revenue,
      time_in_business_years: rounded(randomBetween(0.4, 18, random), 0.1),
      funding_need: fundingNeed,
      risk_profile: riskProfile,
      raw_payload: {
        simulation: true,
        generated_index: index + 1,
        funding_need: fundingNeed,
        risk_profile: riskProfile,
        funding_reason: fundingReason(industry, random),
        bank_statement_signal: riskProfile === "low" ? "stable" : riskProfile === "medium" ? "variable" : "volatile"
      }
    };
  });
}

export function supportedSimulationIndustries() {
  return industries;
}

function resolveRiskProfile(industry: SimulationIndustry, revenue: number, fundingNeed: number, random: () => number): RiskProfile {
  const needRatio = fundingNeed / revenue;
  const base = random();
  if (needRatio > 0.2 || base > 0.94) return "watchlist";
  if (needRatio > 0.15 || base > 0.82) return "high";
  if (industry === "restaurants" || base > 0.55) return "medium";
  return "low";
}

function fundingReason(industry: SimulationIndustry, random: () => number) {
  const reasons: Record<SimulationIndustry, string[]> = {
    trucking: ["fuel float", "truck repair", "new route expansion"],
    logistics: ["warehouse labor", "inventory movement", "route expansion"],
    construction: ["materials purchase", "payroll float", "equipment rental"],
    ecommerce: ["inventory buy", "ad spend", "supplier deposit"],
    restaurants: ["seasonal payroll", "equipment repair", "location refresh"],
    retail: ["inventory restock", "holiday demand", "supplier terms"],
    healthcare: ["billing lag", "equipment upgrade", "staffing"],
    manufacturing: ["raw materials", "machine maintenance", "purchase order fulfillment"]
  };
  return pick(reasons[industry], random);
}

function createSeededRandom(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)] as T;
}

function randomBetween(min: number, max: number, random: () => number) {
  return min + (max - min) * random();
}

function randomInt(min: number, max: number, random: () => number) {
  return Math.floor(randomBetween(min, max + 1, random));
}

function rounded(value: number, nearest: number) {
  return Math.round(value / nearest) * nearest;
}

function toDomain(name: string, index: number) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 28);
  return `${slug}${index + 1}.test.operion.ai`;
}
