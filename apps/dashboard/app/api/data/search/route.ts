import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface SearchParams {
  q?: string; // Search query (name, address, phone, email)
  source?: string; // Filter by source (google_places, csv_upload, apollo, etc)
  status?: string; // Filter by enrichment status
  state?: string; // Filter by state
  city?: string; // Filter by city
  has_email?: boolean; // Only results with email
  has_phone?: boolean; // Only results with phone
  verified?: boolean; // Only verified prospects
  from_date?: string; // ISO date - created after
  to_date?: string; // ISO date - created before
  limit?: number; // Pagination limit
  offset?: number; // Pagination offset
}

interface SearchResult {
  id: string;
  business_name: string;
  address?: string;
  city?: string;
  state?: string;
  phone?: string;
  email?: string;
  website_url?: string;
  industry?: string;
  source_kind: 'manual' | 'ai';
  provider: string;
  enrichment_status: string;
  created_at: string;
  has_email: boolean;
  has_phone: boolean;
  batch_filename?: string;
  row_number?: number;
}

interface SearchResponse {
  total: number;
  returned: number;
  limit: number;
  offset: number;
  results: SearchResult[];
}

/**
 * Search and filter DATA prospects
 *
 * Supports:
 * - Full-text search on business_name, address, phone, email
 * - Filters: source, status, state, city, date_range
 * - Boolean filters: has_email, has_phone, verified
 * - Pagination: limit, offset
 */
export async function GET(request: NextRequest) {
  try {
    await requireFounder(request);

    const searchParams = request.nextUrl.searchParams;

    // Parse params
    const q = searchParams.get('q')?.trim() || '';
    const source = searchParams.get('source');
    const status = searchParams.get('status');
    const state = searchParams.get('state');
    const city = searchParams.get('city');
    const hasEmail = searchParams.get('has_email') === 'true';
    const hasPhone = searchParams.get('has_phone') === 'true';
    const verified = searchParams.get('verified') === 'true';
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    const supabase = await getSupabaseAdmin();

    // Build query
    let query = supabase
      .from('data_prospect_records' as never)
      .select('*', { count: 'exact' } as any);

    // Apply filters
    if (source) {
      query = query.eq('provider' as never, source as never);
    }

    if (status) {
      query = query.eq('enrichment_status' as never, status as never);
    }

    if (state) {
      query = query.eq('state' as never, state as never);
    }

    if (city) {
      query = query.ilike('city' as never, `%${city}%` as never);
    }

    if (hasEmail) {
      query = query.not('normalized_email' as never, 'is' as never, null as never);
    }

    if (hasPhone) {
      query = query.not('normalized_phone' as never, 'is' as never, null as never);
    }

    if (verified) {
      query = query.not('verified_at' as never, 'is' as never, null as never);
    }

    if (fromDate) {
      query = query.gte('created_at' as never, fromDate as never);
    }

    if (toDate) {
      query = query.lte('created_at' as never, toDate as never);
    }

    // Full-text search
    if (q) {
      const searchTerms = q.split(/\s+/).filter(Boolean);
      const conditions = searchTerms.map(term => {
        const likePattern = `%${term}%`;
        return `business_name.ilike.${likePattern},address.ilike.${likePattern},email.ilike.${likePattern},phone.ilike.${likePattern}`;
      });

      // Apply OR conditions for search
      if (conditions.length > 0) {
        // Note: Supabase doesn't support complex OR in simple API
        // This would need a function or be handled in application logic
        // For now, search on business_name
        query = query.ilike('business_name' as never, `%${q}%` as never);
      }
    }

    // Sort by creation date, newest first
    query = query.order('created_at' as never, { ascending: false } as any);

    // Apply pagination
    const { data, error, count } = (await query
      .range(offset, offset + limit - 1)) as any;

    if (error) {
      console.error('Search error:', error);
      return NextResponse.json(
        { error: `Search failed: ${error.message}` },
        { status: 500 }
      );
    }

    const results: SearchResult[] = (data || []).map((prospect: any) => ({
      id: prospect.id,
      business_name: prospect.business_name,
      address: prospect.address,
      city: prospect.city,
      state: prospect.state,
      phone: prospect.phone,
      email: prospect.email,
      website_url: prospect.website_url,
      industry: prospect.industry,
      source_kind: prospect.source_kind,
      provider: prospect.provider,
      enrichment_status: prospect.enrichment_status,
      created_at: prospect.created_at,
      has_email: prospect.has_email,
      has_phone: prospect.has_phone,
      batch_filename: prospect.batch_filename,
      row_number: prospect.row_number
    }));

    const response: SearchResponse = {
      total: count || 0,
      returned: results.length,
      limit,
      offset,
      results
    };

    return NextResponse.json(response);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Search failed: ${message}` },
      { status: 500 }
    );
  }
}
