import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { handleRouteError } from '@/lib/errors';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface ParsedRow {
  business_name: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  website?: string;
  industry?: string;
  [key: string]: any;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Parse CSV file
    const buffer = await file.arrayBuffer();
    const rows = parseFile(file.name, Buffer.from(buffer));

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows found in file' },
        { status: 400 }
      );
    }

    // Create import batch in database
    const supabase = await getSupabaseAdmin();
    const contentHash = createHash('sha256').update(JSON.stringify(rows)).digest('hex');

    const { data: batch, error: batchError } = await (supabase
      .from('acquisition_import_batches' as any)
      .insert({
        filename: file.name,
        content_sha256: contentHash,
        source_kind: 'manual',
        provider: 'csv_upload',
        uploaded_by: actor.id,
        status: 'pending',
      })
      .select()
      .single()) as any;

    if (batchError) {
      return NextResponse.json(
        { error: `Failed to create batch: ${batchError.message}` },
        { status: 500 }
      );
    }

    // Create research queue entries
    const queueEntries = rows.map((row, index) => ({
      batch_id: batch.id,
      row_number: index + 1,
      original_data: row,
      status: 'pending',
      created_at: new Date().toISOString(),
    }));

    const { data: queueData, error: queueError } = await (supabase
      .from('acquisition_import_rows' as any)
      .insert(queueEntries)
      .select()) as any;

    if (queueError) {
      return NextResponse.json(
        { error: `Failed to create research queue: ${queueError.message}` },
        { status: 500 }
      );
    }

    // Trigger research job to start processing
    // For now, mark batch as ready for research
    await (supabase
      .from('acquisition_import_batches' as any)
      .update({ status: 'processing' })
      .eq('id', batch.id)) as any;

    return NextResponse.json({
      success: true,
      batch_id: batch.id,
      filename: file.name,
      rows_imported: rows.length,
      message: `Imported ${rows.length} businesses. Research will begin shortly.`,
    });

  } catch (error) {
    return handleRouteError(error);
  }
}

function parseFile(filename: string, buffer: Buffer): ParsedRow[] {
  try {
    let data: any[] = [];

    if (filename.endsWith('.csv') || filename.endsWith('.CSV')) {
      // Parse CSV
      const text = buffer.toString('utf-8');
      const lines = text.split('\n').filter(l => l.trim());

      if (lines.length < 2) return [];

      const headers = parseCSVLine(lines[0]!);
      data = lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const row: ParsedRow = { business_name: '' };
        headers.forEach((header, idx) => {
          row[header.toLowerCase() as keyof ParsedRow] = values[idx]?.trim() || '';
        });
        return row;
      }).filter(row => Object.values(row).some(v => v)); // Remove empty rows
    } else {
      throw new Error('Unsupported file format. Please use CSV file.');
    }

    // Normalize parsed rows
    return data.map(row => normalizeBusinessRow(row));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown parse error';
    console.error('Parse error:', message);
    throw new Error(`Failed to parse file: ${message}`);
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function normalizeBusinessRow(row: ParsedRow): ParsedRow {
  // Map common column names to standard fields
  const fieldMap: Record<string, string[]> = {
    business_name: ['business_name', 'company', 'company_name', 'name', 'business', 'organization'],
    address: ['address', 'street_address', 'street'],
    city: ['city', 'town'],
    state: ['state', 'province', 'region'],
    zip: ['zip', 'zip_code', 'postal_code', 'postcode'],
    phone: ['phone', 'phone_number', 'contact_phone', 'telephone'],
    email: ['email', 'email_address', 'contact_email'],
    website: ['website', 'website_url', 'url', 'web', 'site'],
    industry: ['industry', 'business_type', 'category', 'sector'],
  };

  const normalized: ParsedRow = { business_name: row.business_name || '' };

  Object.entries(fieldMap).forEach(([standard, aliases]) => {
    for (const alias of aliases) {
      if (row[alias] && row[alias].length > 0) {
        normalized[standard as keyof ParsedRow] = row[alias];
        break;
      }
    }
  });

  // Keep any unmapped fields
  Object.entries(row).forEach(([key, value]) => {
    if (!Object.values(fieldMap).flat().includes(key) && value) {
      normalized[key] = value;
    }
  });

  return normalized;
}
