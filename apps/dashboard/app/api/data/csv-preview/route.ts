import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/auth';
import { createHash } from 'node:crypto';
import { normalizeImportRows } from '@/lib/acquisition/manual-import';

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

interface PreviewResponse {
  preview_id: string;
  filename: string;
  rows_detected: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  missing_email: number;
  missing_phone: number;
  sample_rows: Array<{
    row_number: number;
    business_name?: string;
    address?: string;
    status: 'valid' | 'invalid' | 'duplicate' | string;
    errors?: string[];
  }>;
  summary: string;
}

/**
 * Preview CSV/XLSX file without persisting to database
 *
 * Returns summary statistics and sample data for user confirmation
 * before import via /api/data/csv-upload with preview_id
 */
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

    // Parse file
    const buffer = await file.arrayBuffer();
    const rows = parseFile(file.name, Buffer.from(buffer));

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No data rows found in file' },
        { status: 400 }
      );
    }

    // Normalize rows to detect issues
    const normalizedRows = normalizeImportRows(rows);

    // Categorize rows
    const validRows = normalizedRows.filter(r => r.status === 'valid');
    const invalidRows = normalizedRows.filter(r => r.status === 'invalid');
    const duplicateRows = normalizedRows.filter(r => r.status === 'duplicate');

    const missingEmail = validRows.filter(r => !r.email || r.email.trim() === '').length;
    const missingPhone = validRows.filter(r => !r.phone || r.phone.trim() === '').length;

    // Generate preview ID (store file metadata for later confirmation)
    const previewMetadata = {
      filename: file.name,
      content_hash: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
      uploaded_by: actor.id,
      uploaded_at: new Date().toISOString(),
      row_count: rows.length,
      normalized_rows: normalizedRows
    };

    const previewId = createHash('sha256')
      .update(JSON.stringify(previewMetadata))
      .digest('hex')
      .slice(0, 16);

    // Store preview metadata in session/cache (in real implementation)
    // For now, return it encoded in response for user to send back
    const preview: PreviewResponse = {
      preview_id: previewId,
      filename: file.name,
      rows_detected: rows.length,
      valid_rows: validRows.length,
      invalid_rows: invalidRows.length,
      duplicate_rows: duplicateRows.length,
      missing_email: missingEmail,
      missing_phone: missingPhone,
      sample_rows: normalizedRows.slice(0, 10).map(r => ({
        row_number: r.row_number || 0,
        business_name: r.business_name || '',
        ...(r.address ? { address: r.address } : {}),
        status: r.status,
        errors: r.errors
      })),
      summary: generateSummary({
        rows_detected: rows.length,
        valid_rows: validRows.length,
        invalid_rows: invalidRows.length,
        duplicate_rows: duplicateRows.length,
        missing_email: missingEmail,
        missing_phone: missingPhone
      })
    };

    // Store preview metadata temporarily (would be in Redis/cache in production)
    // For now, we'll send it back and client includes it in confirm
    const previewData = {
      ...preview,
      _metadata: previewMetadata // Include for validation on confirm
    };

    return NextResponse.json(previewData);

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: `Preview failed: ${message}` },
      { status: 400 }
    );
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
      }).filter(row => Object.values(row).some(v => v));
    } else if (
      filename.endsWith('.xlsx') || filename.endsWith('.xls') ||
      filename.endsWith('.XLSX') || filename.endsWith('.XLS')
    ) {
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
        i++;
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

function generateSummary(stats: {
  rows_detected: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  missing_email: number;
  missing_phone: number;
}): string {
  const parts = [
    `${stats.rows_detected} row(s) detected`,
    `${stats.valid_rows} valid`,
    `${stats.invalid_rows} invalid`,
    `${stats.duplicate_rows} duplicate(s)`
  ];

  if (stats.missing_email > 0) {
    parts.push(`${stats.missing_email} missing email`);
  }

  if (stats.missing_phone > 0) {
    parts.push(`${stats.missing_phone} missing phone`);
  }

  return parts.join(' • ');
}
