import type { Json } from "@operion/shared";
import type { RawBusinessLead } from "@/lib/acquisition/normalization";

export const freeFirstSourceKeys = [
  "company_websites",
  "public_business_directories",
  "chamber_directories",
  "industry_associations",
  "public_local_listings",
  "apollo",
  "google_places"
] as const;

export type FreeFirstSourceKey = (typeof freeFirstSourceKeys)[number];

export interface AcquisitionAdapterInput {
  query?: string | undefined;
  category?: string | undefined;
  location?: string | undefined;
  urls?: string[] | undefined;
  limit: number;
}

export interface AcquisitionAdapterResult {
  sourceKey: FreeFirstSourceKey;
  records: RawBusinessLead[];
  errors: string[];
  metadata: Json;
}

export interface AcquisitionSourceAdapter {
  key: FreeFirstSourceKey;
  discover(input: AcquisitionAdapterInput): Promise<AcquisitionAdapterResult>;
}
