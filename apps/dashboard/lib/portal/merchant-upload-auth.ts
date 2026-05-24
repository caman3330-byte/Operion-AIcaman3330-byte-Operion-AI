import { createHash, randomBytes } from "crypto";
import type { BusinessApplication } from "@operion/shared";
import { AuthenticationError, ValidationError } from "@/lib/errors";
import { productionRepository } from "@/lib/repositories/production";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const DEFAULT_EXPIRATION_HOURS = 72;

export interface MerchantUploadSession {
  id: string;
  business_application_id: string;
  email: string;
  expires_at: string;
  application: BusinessApplication;
}

export async function createMerchantUploadMagicLink(input: {
  businessApplicationId: string;
  email: string;
  origin: string;
  requestedBy?: string | null;
}) {
  const application = await productionRepository.getBusinessApplication(input.businessApplicationId);
  const normalizedEmail = normalizeEmail(input.email);

  if (normalizeEmail(application.contact_email) !== normalizedEmail) {
    return { created: false as const };
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPortalToken(token);
  const expiresAt = new Date(Date.now() + DEFAULT_EXPIRATION_HOURS * 60 * 60 * 1000).toISOString();
  const rawSupabase = getSupabaseAdmin() as unknown as { from: (table: string) => any };

  const { error } = await rawSupabase.from("merchant_upload_sessions").insert({
    business_application_id: application.id,
    email: normalizedEmail,
    token_hash: tokenHash,
    expires_at: expiresAt,
    metadata: {
      requested_by: input.requestedBy ?? "merchant",
      source: "portal_upload_link"
    }
  });

  if (error) {
    throw new ValidationError("Unable to create upload session", { message: error.message });
  }

  const url = new URL("/portal/upload", input.origin);
  url.searchParams.set("token", token);

  return {
    created: true as const,
    token,
    url: url.toString(),
    expiresAt,
    application
  };
}

export async function validateMerchantUploadToken(token: string): Promise<MerchantUploadSession> {
  const cleanToken = token.trim();
  if (!cleanToken) throw new AuthenticationError("Upload link is missing or expired");

  const rawSupabase = getSupabaseAdmin() as unknown as { from: (table: string) => any };
  const tokenHash = hashPortalToken(cleanToken);
  const { data, error } = await rawSupabase
    .from("merchant_upload_sessions")
    .select("id,business_application_id,email,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    throw new AuthenticationError("Upload link is missing or expired");
  }

  const application = await productionRepository.getBusinessApplication(data.business_application_id);

  await rawSupabase
    .from("merchant_upload_sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    id: data.id,
    business_application_id: data.business_application_id,
    email: data.email,
    expires_at: data.expires_at,
    application
  };
}

export function hashPortalToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
