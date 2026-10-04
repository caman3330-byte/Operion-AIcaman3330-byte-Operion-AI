import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { handleRouteError } from '@/lib/errors';
import { parseManualImport } from '@/lib/acquisition/manual-import';
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

    // Parse CSV/XLSX through the shared parser so preview and confirmation
    // produce the same normalized rows and content hash.
    const buffer = await file.arrayBuffer();
    const parsed = parseManualImport(file.name, Buffer.from(buffer));
    const normalizedRows = parsed.rows;
    const rawRows = normalizedRows.map((row) => row.raw_payload);
    const contentHash = createHash('sha256').update(JSON.stringify(rawRows)).digest('hex');

    if (!confirmed || typeof previewId !== 'string' || previewId !== contentHash) {
      return NextResponse.json(
        { error: 'Confirm the exact file preview before importing.' },
        { status: 409 }
      );
    }

    // Create an explicitly confirmed DATA batch through the replay-safe import
    // function. It creates DATA prospects and provenance rows only; it does
    // not create leads, applications, or outreach messages.
    const supabase = await getSupabaseAdmin();
    const { data: result, error: importError } = await (supabase as any).rpc('import_data_prospects', {
      p_filename: file.name,
      p_content_sha256: contentHash,
      p_source_kind: 'manual',
      p_provider: 'csv_upload',
      p_uploaded_by: actor.id,
      p_rows: normalizedRows,
    });

    if (importError || !result) {
      return NextResponse.json(
        { error: `Failed to import DATA rows: ${importError?.message ?? 'No import result returned.'}` },
        { status: 500 }
      );
    }

    const counts = result.counts ?? {};
    const summary = {
      batch_id: result.batch_id,
      batch_code: result.batch_code,
      filename: file.name,
      total_rows: counts.total ?? normalizedRows.length,
      valid_rows: counts.imported ?? 0,
      invalid_rows: counts.invalid ?? 0,
      duplicate_rows: counts.duplicate ?? 0,
      missing_email: counts.missing_email ?? 0,
      missing_phone: counts.missing_phone ?? 0,
    };

    return NextResponse.json({
      success: true,
      replayed: Boolean(result.replayed),
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
