import { createClient } from "@supabase/supabase-js";
import { AuthorizationError, AuthenticationError, ConfigurationError } from "@/lib/errors";
import { getConfigurationStatus } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AppRole } from "@operion/shared";
import type { Database } from "@/lib/supabase/types";

export type ExtendedAppRole = AppRole | "admin" | "operator" | "analyst" | "super_admin" | "workflow";
type RoleClaimSource = {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

export interface FounderActor {
  id: string;
  email: string;
  role: ExtendedAppRole;
}

const founderEquivalentRoles: ExtendedAppRole[] = ["founder", "super_admin", "admin"];
const builtInFounderEmails = ["founder@operion.ai", "founder@operioncapital.com", "admin@operion.ai"];

export async function requireFounder(request: Request): Promise<FounderActor> {
  return requireRole(request, founderEquivalentRoles);
}

export async function requireInternalUser(request: Request): Promise<FounderActor> {
  return requireRole(request, ["staff", "supervisor", "founder", "super_admin", "admin", "operator", "analyst"]);
}

export async function requireCustomer(request: Request): Promise<FounderActor> {
  return requireRole(request, ["customer", "staff", "supervisor", "founder", "super_admin", "admin", "operator", "analyst", "workflow"]);
}

export async function requireRole(request: Request, allowedRoles: ExtendedAppRole[]): Promise<FounderActor> {
  const config = getConfigurationStatus();
  const adminEmail = process.env.ADMIN_EMAIL;
  const internalKey = process.env.OPERION_INTERNAL_API_KEY;

  if (internalKey && request.headers.get("x-operion-internal-key") === internalKey) {
    return {
      id: "n8n_workflow",
      email: "n8n_workflow",
      role: "workflow"
    };
  }

  if (!config.auth) {
    if (process.env.NODE_ENV !== "production") {
      return {
        id: "local-founder",
        email: adminEmail ?? "founder@operion.ai",
        role: "founder"
      };
    }

    throw new ConfigurationError("Supabase Auth must be configured for protected API routes");
  }

  const user = await getRequestUser(request);
  if (!user.email) {
    throw new AuthenticationError();
  }

  const role = await resolveUserRole(user.id, user.email, user);
  if (!allowedRoles.includes(role)) {
    throw new AuthorizationError(allowsInternalAccess(allowedRoles) ? "Internal operator access required" : "Founder access required");
  }

  return {
    id: user.id,
    email: user.email,
    role
  };
}

export async function getRequestUser(request: Request) {
  const token = extractBearerToken(request);
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    }
  );

  if (token) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user.email) {
      throw new AuthenticationError("Invalid Supabase session");
    }

    return {
      id: data.user.id,
      email: data.user.email,
      app_metadata: data.user.app_metadata,
      user_metadata: data.user.user_metadata
    };
  }

  // Prefer @supabase/ssr via Next.js cookies() — handles chunked/refreshed tokens reliably
  try {
    const { createServerClient } = await import("@supabase/ssr");
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const ssrClient = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: unknown }>) {
            try {
              for (const { name, value, options } of cookiesToSet) {
                cookieStore.set(name, value, options as any);
              }
            } catch {
              // Route handlers can set cookies; server components cannot — ignore
            }
          }
        }
      }
    );
    const { data, error } = await ssrClient.auth.getUser();
    if (!error && data.user?.email) {
      return {
        id: data.user.id,
        email: data.user.email,
        app_metadata: data.user.app_metadata,
        user_metadata: data.user.user_metadata
      };
    }
  } catch {
    // Fall through to legacy cookie parsing if Next.js context unavailable
  }

  // Legacy fallback: manual Supabase cookie parsing
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    throw new AuthenticationError();
  }

  const accessToken = extractSupabaseCookieToken(cookieHeader);
  if (!accessToken) {
    throw new AuthenticationError();
  }

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user.email) {
    throw new AuthenticationError("Invalid Supabase session");
  }

  return {
    id: data.user.id,
    email: data.user.email,
    app_metadata: data.user.app_metadata,
    user_metadata: data.user.user_metadata
  };
}

export async function resolveUserRole(userId: string, email: string, claims?: RoleClaimSource): Promise<ExtendedAppRole> {
  if (isFounderEmail(email)) {
    return "founder";
  }

  const metadataRole = normalizeRoleClaim(
    claims?.app_metadata?.app_role ??
      claims?.app_metadata?.role ??
      claims?.user_metadata?.app_role ??
      claims?.user_metadata?.role
  );
  if (metadataRole) {
    return metadataRole;
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("profiles")
      .select("role")
      .or(`id.eq.${userId},email.eq.${email.toLowerCase()}`)
      .maybeSingle();
    if (!error && data?.role) {
      return normalizeRoleClaim(data.role) ?? "customer";
    }
  } catch {
    return "customer";
  }

  return "customer";
}

export function isFounderEmail(email: string) {
  const configuredFounderEmails = [
    process.env.ADMIN_EMAIL,
    process.env.FOUNDER_EMAIL,
    process.env.OPERION_FOUNDER_EMAILS
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...builtInFounderEmails, ...configuredFounderEmails]).has(email.trim().toLowerCase());
}

function allowsInternalAccess(allowedRoles: ExtendedAppRole[]) {
  return allowedRoles.some((role) => ["staff", "supervisor", "operator", "analyst", "workflow"].includes(role));
}

function normalizeRoleClaim(value: unknown): ExtendedAppRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "customer" ||
    normalized === "staff" ||
    normalized === "supervisor" ||
    normalized === "founder" ||
    normalized === "admin" ||
    normalized === "operator" ||
    normalized === "analyst" ||
    normalized === "super_admin"
  ) {
    return normalized;
  }

  return null;
}

function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

function extractSupabaseCookieToken(cookieHeader: string) {
  const cookies = new Map(
    cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf("=");
        if (separatorIndex === -1) return null;
        return [cookie.slice(0, separatorIndex), cookie.slice(separatorIndex + 1)] as const;
      })
      .filter((cookie): cookie is readonly [string, string] => Boolean(cookie))
  );

  const baseAuthCookieNames = [...cookies.keys()].filter((name) => name.startsWith("sb-") && name.endsWith("-auth-token"));
  const accessCookieNames = [...cookies.keys()].filter((name) => name.startsWith("sb-") && name.endsWith("-access-token"));
  const chunkedAuthCookieBaseNames = [
    ...new Set(
      [...cookies.keys()]
        .filter((name) => name.startsWith("sb-") && /-auth-token\.\d+$/.test(name))
        .map((name) => name.replace(/\.\d+$/, ""))
    )
  ];
  const chunkedAccessCookieBaseNames = [
    ...new Set(
      [...cookies.keys()]
        .filter((name) => name.startsWith("sb-") && /-access-token\.\d+$/.test(name))
        .map((name) => name.replace(/\.\d+$/, ""))
    )
  ];

  const authCookieNames = [...baseAuthCookieNames, ...accessCookieNames, ...chunkedAuthCookieBaseNames, ...chunkedAccessCookieBaseNames];
  for (const baseName of authCookieNames) {
    const rawValue = cookies.get(baseName) ?? readChunkedCookie(cookies, baseName);
    if (!rawValue) {
      continue;
    }

    const token = parseAuthCookieToken(rawValue);
    if (token) {
      return token;
    }

    if (isJwt(rawValue)) {
      return rawValue;
    }
  }

  return null;
}

function isJwt(value: string) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}

function readChunkedCookie(cookies: Map<string, string>, baseName: string) {
  const chunks = [...cookies.entries()]
    .filter(([name]) => name.startsWith(`${baseName}.`))
    .sort(([left], [right]) => Number(left.split(".").at(-1)) - Number(right.split(".").at(-1)))
    .map(([, value]) => value);

  return chunks.length > 0 ? chunks.join("") : null;
}

function parseAuthCookieToken(rawValue: string) {
  try {
    const decoded = decodeURIComponent(rawValue);
    const normalized = decoded.startsWith("base64-") ? atob(decoded.slice("base64-".length)) : decoded;
    const parsed = JSON.parse(normalized) as unknown;
    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0];
    }
    if (parsed && typeof parsed === "object" && "access_token" in parsed && typeof parsed.access_token === "string") {
      return parsed.access_token;
    }
  } catch {
    return null;
  }

  return null;
}
