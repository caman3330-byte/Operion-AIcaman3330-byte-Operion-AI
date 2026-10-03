export interface DeduplicationKey {
  google_place_id?: string | null;
  domain?: string | null;
  phone_normalized?: string | null;
  business_name_address_normalized?: string | null;
}

export async function checkDuplicate(
  supabase: any,
  key: DeduplicationKey,
  excludeId?: string
): Promise<{ isDuplicate: boolean; existingId?: string }> {
  // Check by Google Place ID first (strongest identifier)
  if (key.google_place_id) {
    const { data } = await supabase
      .from('acquisition_prospects' as any)
      .select('id')
      .eq('source_payload->>place_id', key.google_place_id)
      .neq('id', excludeId || 'null')
      .limit(1) as any;

    if (data && data.length > 0) {
      return { isDuplicate: true, existingId: data[0].id };
    }
  }

  // Check by normalized domain
  if (key.domain) {
    const { data } = await supabase
      .from('acquisition_prospects' as any)
      .select('id')
      .ilike('website_url', `%${key.domain}%`)
      .neq('id', excludeId || 'null')
      .limit(1) as any;

    if (data && data.length > 0) {
      return { isDuplicate: true, existingId: data[0].id };
    }
  }

  // Check by normalized phone
  if (key.phone_normalized) {
    const { data } = await supabase
      .from('acquisition_prospects' as any)
      .select('id')
      .eq('source_payload->>phone_normalized', key.phone_normalized)
      .neq('id', excludeId || 'null')
      .limit(1) as any;

    if (data && data.length > 0) {
      return { isDuplicate: true, existingId: data[0].id };
    }
  }

  // Check by business name + address (normalized)
  if (key.business_name_address_normalized) {
    const { data } = await supabase
      .from('acquisition_prospects' as any)
      .select('id')
      .eq('source_payload->>identity_key', key.business_name_address_normalized)
      .neq('id', excludeId || 'null')
      .limit(1) as any;

    if (data && data.length > 0) {
      return { isDuplicate: true, existingId: data[0].id };
    }
  }

  return { isDuplicate: false };
}

export function createDeduplicationKey(businessData: {
  business_name: string;
  website_url?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  google_place_id?: string | null;
}): DeduplicationKey {
  const extractDomain = (url?: string | null): string | null => {
    if (!url) return null;
    try {
      return new URL(url).hostname || null;
    } catch {
      return null;
    }
  };

  const normalizePhone = (phone?: string | null): string | null => {
    if (!phone) return null;
    return phone.replace(/\D/g, '').slice(-10) || null;
  };

  const normalizeBusinessAddress = (name: string, city?: string | null, state?: string | null): string => {
    return [name, city, state]
      .filter(Boolean)
      .join('_')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_');
  };

  return {
    google_place_id: businessData.google_place_id || null,
    domain: extractDomain(businessData.website_url),
    phone_normalized: normalizePhone(businessData.phone),
    business_name_address_normalized: normalizeBusinessAddress(
      businessData.business_name,
      businessData.city,
      businessData.state
    ),
  };
}
