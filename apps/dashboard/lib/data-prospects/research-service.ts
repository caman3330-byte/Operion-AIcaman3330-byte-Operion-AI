import type { ManualImportRow } from '@/lib/acquisition/manual-import';

export interface ResearchData {
  business_name?: string;
  website_url?: string;
  normalized_phone?: string;
  normalized_email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  industry?: string;
  google_place_id?: string;
}

export interface ResearchResult {
  verified_fields: Partial<ResearchData>;
  unverified_fields: string[];
  sources: string[];
  confidence: number; // 0-100
  matched_google_place_id?: string | undefined;
  issues: string[];
}

export interface QualificationResult {
  fit_level: 'strong_fit' | 'possible_fit' | 'weak_fit' | 'not_a_fit' | 'needs_review';
  fit_reason: string;
  lead_score: number; // 0-100
  score_breakdown: {
    field: string;
    verified: boolean;
    points: number;
  }[];
  missing_critical: string[];
  next_action: string;
}

// Research service - enriches business data from available sources
export async function researchBusiness(
  business: ResearchData,
  googlePlacesAdapter?: any
): Promise<ResearchResult> {
  const verified_fields: Partial<ResearchData> = {};
  const unverified_fields: string[] = [];
  const sources: string[] = [];
  const issues: string[] = [];
  let confidence = 0;
  let matched_google_place_id: string | undefined;

  // If Google Places adapter available, search for the business
  if (googlePlacesAdapter && business.business_name) {
    try {
      const placeResult = await googlePlacesAdapter.discover({
        query: business.business_name,
        location: business.city && business.state
          ? `${business.city}, ${business.state}`
          : undefined,
        limit: 1,
        sourceTimeoutMs: 5000,
      });

      if (placeResult.records && placeResult.records.length > 0) {
        const place = placeResult.records[0];

        // Verify fields against Google Places data
        if (place.business_name) {
          verified_fields.business_name = place.business_name;
          confidence += 25;
        }
        if (place.website_url) {
          verified_fields.website_url = place.website_url;
          confidence += 15;
        }
        if (place.normalized_phone) {
          verified_fields.normalized_phone = place.normalized_phone;
          confidence += 15;
        }
        if (place.address) {
          verified_fields.address = place.address;
        }
        if (place.city) {
          verified_fields.city = place.city;
        }
        if (place.state) {
          verified_fields.state = place.state;
        }
        if (place.zip) {
          verified_fields.zip = place.zip;
        }
        if (place.industry) {
          verified_fields.industry = place.industry;
        }

        matched_google_place_id = place.google_place_id;
        sources.push('google_places');

        // Check for data mismatches
        if (business.business_name && place.business_name &&
            normalizeName(business.business_name) !== normalizeName(place.business_name)) {
          issues.push(`Business name mismatch: uploaded="${business.business_name}", verified="${place.business_name}"`);
        }
      } else {
        issues.push('Google Places: No matching business found');
      }
    } catch (err) {
      issues.push(`Google Places error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  // If no Google Places data, use uploaded information with lower confidence
  if (sources.length === 0) {
    // Mark all uploaded data as unverified but present
    if (business.business_name) {
      unverified_fields.push('business_name');
      confidence += 5;
    }
    if (business.website_url) {
      unverified_fields.push('website_url');
      confidence += 5;
    }
    if (business.normalized_phone) {
      unverified_fields.push('phone');
      confidence += 5;
    }
    sources.push('uploaded_data');
  }

  // Clamp confidence to 0-100
  confidence = Math.min(100, Math.max(0, confidence));

  return {
    verified_fields,
    unverified_fields,
    sources,
    confidence,
    matched_google_place_id,
    issues,
  };
}

export async function qualifyBusiness(
  business: ResearchData,
  researchResult: ResearchResult
): Promise<QualificationResult> {
  const score_breakdown: QualificationResult['score_breakdown'] = [];
  let total_score = 0;

  // Score verified fields (highest weight)
  const verified_keys = Object.keys(researchResult.verified_fields);

  if (verified_keys.includes('business_name')) {
    score_breakdown.push({ field: 'business_name', verified: true, points: 20 });
    total_score += 20;
  }

  if (verified_keys.includes('website_url')) {
    score_breakdown.push({ field: 'website_url', verified: true, points: 15 });
    total_score += 15;
  }

  if (verified_keys.includes('normalized_phone')) {
    score_breakdown.push({ field: 'phone', verified: true, points: 15 });
    total_score += 15;
  }

  if (verified_keys.includes('address')) {
    score_breakdown.push({ field: 'address', verified: true, points: 10 });
    total_score += 10;
  }

  // Check data quality from unverified fields
  if (business.normalized_email && !business.normalized_email.includes('@example.')) {
    score_breakdown.push({ field: 'email', verified: false, points: 5 });
    total_score += 5;
  }

  if (business.industry && business.industry.trim().length > 0) {
    score_breakdown.push({ field: 'industry', verified: false, points: 10 });
    total_score += 10;
  }

  // Confidence bonus
  score_breakdown.push({ field: 'research_confidence', verified: false, points: Math.floor(researchResult.confidence / 5) });
  total_score += Math.floor(researchResult.confidence / 5);

  const lead_score = Math.min(100, total_score);

  // Determine fit level and reasoning
  let fit_level: QualificationResult['fit_level'] = 'needs_review';
  let fit_reason = '';
  const missing_critical: string[] = [];
  let next_action = '';

  // Check for disqualifiers
  if (researchResult.issues.some(i => i.includes('mismatch'))) {
    fit_level = 'weak_fit';
    fit_reason = 'Business identity could not be reliably verified';
    next_action = 'Manual review required';
  } else if (verified_keys.length >= 4 && lead_score >= 75) {
    fit_level = 'strong_fit';
    fit_reason = 'Multiple verified contact methods and business information';
    next_action = 'Ready for outreach';
  } else if (verified_keys.length >= 2 && lead_score >= 60) {
    fit_level = 'possible_fit';
    fit_reason = 'Some verified information, may need enrichment';
    next_action = 'Further research recommended';
  } else if (verified_keys.length >= 1) {
    fit_level = 'possible_fit';
    fit_reason = 'Minimal verified data, business exists';
    next_action = 'Additional enrichment needed';
  } else {
    fit_level = 'not_a_fit';
    fit_reason = 'Could not verify business information';
    missing_critical.push('All critical fields unverified');
    next_action = 'Requires manual verification';
  }

  // Check for missing critical fields
  if (!verified_keys.includes('normalized_phone') && !verified_keys.includes('normalized_email')) {
    missing_critical.push('contact_information');
  }
  if (!verified_keys.includes('website_url')) {
    missing_critical.push('website_verification');
  }

  return {
    fit_level,
    fit_reason,
    lead_score,
    score_breakdown,
    missing_critical,
    next_action,
  };
}

// Normalize business names for comparison
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Convert research result to ManualImportRow format
export function researchToImportRow(
  originalRow: any,
  research: ResearchResult,
  qualification: QualificationResult
): ManualImportRow {
  const verified = research.verified_fields;

  return {
    business_name: verified.business_name || originalRow.business_name || '',
    industry: verified.industry || originalRow.industry || '',
    address: verified.address || originalRow.address || '',
    city: verified.city || originalRow.city || '',
    state: verified.state || originalRow.state || '',
    zip: verified.zip || originalRow.zip || '',
    website_url: verified.website_url || originalRow.website_url || null,
    normalized_phone: verified.normalized_phone || originalRow.normalized_phone || null,
    normalized_email: verified.normalized_email || originalRow.normalized_email || null,
    source_payload: {
      original_upload: originalRow,
      research_result: research,
      qualification: qualification,
      research_timestamp: new Date().toISOString(),
      research_sources: research.sources,
      google_place_id: research.matched_google_place_id,
    },
  };
}
