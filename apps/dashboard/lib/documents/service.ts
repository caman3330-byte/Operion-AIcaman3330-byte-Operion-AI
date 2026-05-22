import { getSupabaseAdmin } from '../supabase/server';
import { logger } from '../logger';

const DOCUMENT_BUCKET = 'merchant_documents';
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const MAX_FILE_SIZE_MB = 50;

export interface DocumentMetadata {
  documentType:
    | 'bank_statement'
    | 'tax_return'
    | 'voided_check'
    | 'business_license'
    | 'id_verification'
    | 'proof_of_address'
    | 'invoice'
    | 'other';
  uploadedBy: string;
  uploadedAt: string;
  fileName: string;
  mimeType: string;
  fileSizeMB: number;
  verified: boolean;
}

/**
 * Generate signed upload URL for secure document upload
 */
export async function generateSignedUploadUrl(
  merchantId: string,
  fileName: string,
  mimeType: string
): Promise<{ uploadUrl: string; fileKey: string; error?: string }> {
  try {
    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return { uploadUrl: '', fileKey: '', error: 'File type not allowed' };
    }

    const supabase = await getSupabaseAdmin();

    // Generate unique file key
    const timestamp = Date.now();
    const sanitizedFileName = fileName
      .replace(/[^a-z0-9._-]/gi, '_')
      .substring(0, 100);
    const fileKey = `${merchantId}/${timestamp}_${sanitizedFileName}`;

    // Generate signed URL (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUploadUrl(fileKey, 3600);

    if (error) {
      logger.error('Failed to generate upload URL', { error: error.message });
      return { uploadUrl: '', fileKey: '', error: error.message };
    }

    return {
      uploadUrl: data?.signedUrl || '',
      fileKey,
    };
  } catch (error) {
    logger.error('Exception generating upload URL', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { uploadUrl: '', fileKey: '', error: 'Internal error' };
  }
}

/**
 * Create document record in database
 */
export async function createDocumentRecord(input: {
  merchantId: string;
  businessApplicationId: string;
  documentType: string;
  fileKey: string;
  fileName: string;
  mimeType: string;
  fileSizeMB: number;
  uploadedBy: string;
}): Promise<{ success: boolean; documentId?: string; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    const { data, error } = await supabase
      .from('documents')
      .insert({
        business_application_id: input.businessApplicationId,
        document_type: input.documentType,
        file_name: input.fileName,
        storage_path: input.fileKey,
        mime_type: input.mimeType,
        file_size: Math.round(input.fileSizeMB * 1024 * 1024),
        status: 'uploaded',
        metadata: {
          uploadedBy: input.uploadedBy,
          merchantId: input.merchantId,
        },
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create document record', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info('Document record created', {
      documentId: (data as any)?.id,
      documentType: input.documentType,
    });

    return { success: true, documentId: (data as any)?.id };
  } catch (error) {
    logger.error('Exception creating document record', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Get signed download URL for document
 */
export async function getSignedDownloadUrl(fileKey: string): Promise<{ downloadUrl: string; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    const { data, error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(fileKey, 3600); // Valid for 1 hour

    if (error) {
      logger.error('Failed to generate download URL', { error: error.message });
      return { downloadUrl: '', error: error.message };
    }

    return { downloadUrl: data?.signedUrl || '' };
  } catch (error) {
    logger.error('Exception generating download URL', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { downloadUrl: '', error: 'Internal error' };
  }
}

/**
 * Mark document as verified (typically after OCR or manual review)
 */
export async function verifyDocument(documentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    const { error } = await supabase
      .from('documents')
      .update({
        status: 'verified',
        verified_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (error) {
      logger.error('Failed to verify document', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info('Document verified', { documentId });
    return { success: true };
  } catch (error) {
    logger.error('Exception verifying document', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}

/**
 * Validate file before upload
 */
export function validateDocumentUpload(
  fileName: string,
  mimeType: string,
  fileSizeMB: number
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check file name
  if (!fileName || fileName.length === 0) {
    errors.push('File name is required');
  }

  // Check mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    errors.push(`File type ${mimeType} is not allowed`);
  }

  // Check file size
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    errors.push(`File size exceeds maximum of ${MAX_FILE_SIZE_MB}MB`);
  }

  // Check for dangerous file extensions
  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.scr'];
  if (dangerousExtensions.some((ext) => fileName.toLowerCase().endsWith(ext))) {
    errors.push('File type is not permitted');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * List documents for an application
 */
export async function listApplicationDocuments(
  applicationId: string
): Promise<{ documents: any[]; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('business_application_id', applicationId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Failed to list application documents', { error: error.message });
      return { documents: [], error: error.message };
    }

    return { documents: data || [] };
  } catch (error) {
    logger.error('Exception listing application documents', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { documents: [], error: 'Internal error' };
  }
}

/**
 * Delete document (soft delete in DB, hard delete from storage optional)
 */
export async function deleteDocument(documentId: string, hardDelete: boolean = false): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseAdmin();

    if (hardDelete) {
      // Get file key first
      const { data: doc } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('id', documentId)
        .single();

      if (doc?.storage_path) {
        await supabase.storage.from(DOCUMENT_BUCKET).remove([doc.storage_path]);
      }
    }

    // Soft delete: mark as deleted
    const { error } = await supabase
      .from('documents')
      .update({
        status: 'deleted',
      })
      .eq('id', documentId);

    if (error) {
      logger.error('Failed to delete document', { error: error.message });
      return { success: false, error: error.message };
    }

    logger.info('Document deleted', { documentId, hardDelete });
    return { success: true };
  } catch (error) {
    logger.error('Exception deleting document', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, error: 'Internal error' };
  }
}
