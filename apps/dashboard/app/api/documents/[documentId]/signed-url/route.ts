import { NextRequest, NextResponse } from "next/server";
import { requireCustomer, requireInternalUser } from "@/lib/auth";
import { getDocumentStorageBucket } from "@/lib/documents/processing";
import { AuthenticationError, AuthorizationError, NotFoundError, handleRouteError } from "@/lib/errors";
import { validateMerchantUploadToken } from "@/lib/portal/merchant-upload-auth";
import { productionRepository } from "@/lib/repositories/production";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    const document = await productionRepository.getDocument(documentId);
    if (!document.storage_path) {
      throw new NotFoundError("Document file is not available");
    }

    await authorizeDocumentAccess(request, document);

    const bucket = document.storage_bucket ?? getDocumentStorageBucket(document.document_type);
    const signedUrlOptions = document.file_name ? { download: document.file_name } : undefined;
    const { data, error } = await getSupabaseAdmin().storage.from(bucket).createSignedUrl(document.storage_path, 5 * 60, signedUrlOptions);

    if (error || !data?.signedUrl) {
      throw new NotFoundError("Unable to create secure document link");
    }

    return NextResponse.redirect(data.signedUrl);
  } catch (error) {
    return handleRouteError(error);
  }
}

async function authorizeDocumentAccess(request: NextRequest, document: Awaited<ReturnType<typeof productionRepository.getDocument>>) {
  try {
    await requireInternalUser(request);
    return;
  } catch {
    // Fall through to customer or merchant-link checks.
  }

  try {
    const actor = await requireCustomer(request);
    if (document.business_application_id) {
      await productionRepository.getCustomerBusinessApplication(actor.id, document.business_application_id);
      return;
    }
    if (document.user_id === actor.id) return;
  } catch {
    // Fall through to merchant link check.
  }

  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!token) throw new AuthenticationError("A secure document session is required");

  const session = await validateMerchantUploadToken(token);
  if (session.business_application_id !== document.business_application_id) {
    throw new AuthorizationError("Document access denied");
  }
}
