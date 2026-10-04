import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { handleRouteError } from '@/lib/errors';
import { normalizeImportRows } from '@/lib/acquisition/manual-import';
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

// Use normalizeImportRows from lib/acquisition/manual-import for actual processing

export async function POST(request: NextRequest) {
  try {
    const actor = await requireFounder(request);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const confirmed = formData.get('confirm') === 'true';
    const previewId = formData.get('preview_id');

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Parse CSV file
    const buffer = await file.arrayBuffer();
    const rawRows = parseFile(file.name, Buffer.from(buffer));

    if (rawRows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows found in file' },
        { status: 400 }
      );
    }

    // Normalize rows to categorize (valid/invalid/duplicate) and preserve originals
    const normalizedRows = normalizeImportRows(rawRows);
    const contentHash = createHash('sha256').update(JSON.stringify(rawRows)).digest('hex');

    if (!confirmed || typeof previewId !== 'string' || previewId !== contentHash) {
      return NextResponse.json(
        { error: 'Confirm the exact file preview before importing.' },
        { status: 409 }
      );
    }

    // Create an explicitly confirmed DATA batch. This only queues source rows;
    // it does not create leads, applications, or outreach messages.
    const supabase = await getSupabaseAdmin();
    const batchCode = 'CSV-' + contentHash.slice(0, 16);

    const { data: batch, error: batchError } = await (supabase
      .from('acquisition_import_batches' as any)
      .insert({
        batch_code: batchCode,
        original_filename: file.name,
        content_sha256: contentHash,
        source_kind: 'manual',
        provider: 'csv_upload',
        uploaded_by: actor.id,
        status: 'confirmed', // Use existing enum: previewed|confirmed|failed|cancelled
        total_rows: normalizedRows.length,
        valid_rows: normalizedRows.filter(r => r.status === 'valid').length,
        duplicate_rows: normalizedRows.filter(r => r.status === 'duplicate').length,
        invalid_rows: normalizedRows.filter(r => r.status === 'invalid').length,
        missing_email_rows: normalizedRows.filter(r => !r.email || r.email.trim() === '').length,
        missing_phone_rows: normalizedRows.filter(r => !r.phone || r.phone.trim() === '').length,
      })
      .select()
      .single()) as any;

    if (batchError) {
      return NextResponse.json(
        { error: `Failed to create batch: ${batchError.message}` },
        { status: 500 }
      );
    }

    // Create import row entries for ALL rows (valid, invalid, duplicate preserved)
    const queueEntries = normalizedRows.map((normRow, idx) => ({
      batch_id: batch.id,
      row_number: idx + 1,
      original_data: rawRows[idx], // Complete original row before normalization
      status: normRow.status, // Will be 'valid'|'invalid'|'duplicate'
      normalized_payload: {
        business_name: normRow.business_name,
        address: normRow.address,
        city: normRow.city,
        state: normRow.state,
        zip: normRow.zip,
        phone: normRow.phone,
        email: normRow.email,
        website_url: normRow.website_url,
        industry: normRow.industry,
      },
      validation_errors: normRow.errors || [],
      duplicate_reason: normRow.duplicate_reason || null,
      created_at: new Date().toISOString(),
    }));

    const { data: queueData, error: queueError } = await (supabase
      .from('acquisition_import_rows' as any)
      .insert(queueEntries)
      .select()) as any;

    if (queueError) {
      return NextResponse.json(
        { error: `Failed to create import rows: ${queueError.message}` },
        { status: 500 }
      );
    }

    // Summary response with actual statistics
    const summary = {
      batch_id: batch.id,
      batch_code: batch.batch_code,
      filename: file.name,
      total_rows: normalizedRows.length,
      valid_rows: normalizedRows.filter(r => r.status === 'valid').length,
      invalid_rows: normalizedRows.filter(r => r.status === 'invalid').length,
      duplicate_rows: normalizedRows.filter(r => r.status === 'duplicate').length,
      missing_email: normalizedRows.filter(r => !r.email || r.email.trim() === '').length,
      missing_phone: normalizedRows.filter(r => !r.phone || r.phone.trim() === '').length,
    };

    return NextResponse.json({
      success: true,
      ...summary,
      message: `Confirmed ${summary.total_rows} rows for DATA research: ${summary.valid_rows} valid, ${summary.invalid_rows} invalid, ${summary.duplicate_rows} duplicates. No leads or outreach were created.`,
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
    } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls') || filename.endsWith('.XLSX') || filename.endsWith('.XLS')) {
      // Parse Excel using xlsx
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Excel file has no sheets');

      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      data = jsonData as any[];
    } else {
      throw new Error('Unsupported file format. Please use CSV (.csv) or Excel (.xlsx) file.');
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
