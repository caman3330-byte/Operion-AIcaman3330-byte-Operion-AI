import { NextResponse, type NextRequest } from "next/server";

const deprecatedMerchantPrefixes = [
  "/dashboard",
  "/application-status",
  "/settings"
];

const deprecatedMerchantAuthPrefixes = [
  "/login",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password"
];

const internalProtectedPrefixes = [
  "/admin",
  "/operations",
  "/executive",
  "/supervisor",
  "/manager-agent",
  "/acquisition",
  "/leads",
  "/merchants",
  "/lenders",
  "/outreach",
  "/testing",
  "/reports",
  "/audit",
  "/prompts",
  "/ai-prompts"
];

const adminProtectedPrefixes = [
  "/admin",
  "/api/admin"
];

const operationalTestingPrefixes = [
  "/admin/testing",
  "/supervisor/testing",
  "/testing"
];

const publicApiPrefixes = [
  "/api/health",
  "/api/applications",
  "/api/portal/upload-link",
  "/api/auth/logout",
  "/api/webhooks/sendgrid"
];

const customerApiPrefixes = [
  "/api/documents"
];

const internalRoles = new Set([
  "staff",
  "supervisor",
  "founder",
  // Backwards/forwards compatibility with expanded RBAC
  "super_admin",
  "admin",
  "operator",
  "analyst"
]);

const adminRoles = new Set(["founder", "super_admin", "admin"]);
const builtInFounderEmails = ["founder@operion.ai", "founder@operioncapital.com", "admin@operion.ai"];

export async function middleware(request: NextRequest) {
  const pathname = normalizeDashboardPath(request.nextUrl.pathname);
  const internalApiKey = process.env.OPERION_INTERNAL_API_KEY;

  if (isDeprecatedMerchantRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/thank-you";
    url.searchParams.set("source", "deprecated_merchant_portal");
    return NextResponse.redirect(url);
  }

  if (isDeprecatedMerchantAuthRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/apply";
    url.searchParams.set("source", "merchant_auth_removed");
    return NextResponse.redirect(url);
  }

  // Only run middleware for protected routes to avoid interfering with the public root and marketing pages.
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api");

  // Allow signed server-to-server automation requests through protected APIs.
  // Page bypass is kept for local automated testing only.
  if (internalApiKey && request.headers.get("x-operion-internal-key") === internalApiKey) {
    if (isApiRoute || process.env.NODE_ENV !== "production") {
      return withSecurityHeaders(NextResponse.next());
    }
  }

  if (pathname.startsWith("/api")) {
    if (isPublicApiRoute(pathname) || isCustomerApiRoute(pathname)) {
      return withSecurityHeaders(NextResponse.next());
    }

    // Lazily import Supabase server client only for protected API routes.
    let createServerClient: any;
    try {
      ({ createServerClient } = await import("@supabase/ssr"));
    } catch {
      return new NextResponse(JSON.stringify({ error: "middleware_auth_initialization_failed" }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    if (!configured) {
      return new NextResponse(JSON.stringify({ error: "authentication_not_configured" }), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }

    let response = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: Array<{
              name: string;
              value: string;
              options?: Parameters<typeof response.cookies.set>[2];
            }>
          ) {
            cookiesToSet.forEach(({ name, value, options }) => {
              if (options) {
                response.cookies.set(name, value, options);
              } else {
                response.cookies.set(name, value);
              }
            });
          }
        }
      }
    );

    const bearerToken = extractBearerToken(request);
    const { data } = bearerToken ? await supabase.auth.getUser(bearerToken) : await supabase.auth.getUser();
    if (!data.user) {
      return new NextResponse(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    const role = await resolveRole(supabase, data.user.id, data.user.email ?? "", data.user);
    if (!internalRoles.has(role)) {
      return new NextResponse(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }
    if (isAdminProtectedRoute(pathname) && !isOperationalTestingRoute(pathname) && !adminRoles.has(role)) {
      return new NextResponse(JSON.stringify({ error: "admin_role_required" }), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }

    return withSecurityHeaders(response);
  }

  let response = NextResponse.next();

  // Lazily import Supabase server client to avoid bundling server-only libs into middleware.
  let createServerClient: any;
  try {
    ({ createServerClient } = await import("@supabase/ssr"));
  } catch {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("auth", "middleware_error");
    return NextResponse.redirect(url);
  }

  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!configured) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("auth", "not_configured");
    return NextResponse.redirect(url);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Parameters<typeof response.cookies.set>[2];
          }>
        ) {
          cookiesToSet.forEach(({ name, value, options }) => {
            if (options) {
              response.cookies.set(name, value, options);
            } else {
              response.cookies.set(name, value);
            }
          });
        }
      }
    }
  );

  const { data } = await supabase.auth.getUser();

  if (!data.user && isInternalProtectedRoute(pathname)) {
    // If this is an API admin route, return 401 JSON instead of redirecting.
    if (pathname.startsWith("/api/")) {
      return new NextResponse(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { "content-type": "application/json" } });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/supervisor/login";
    url.searchParams.set("redirectTo", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (data.user && isInternalProtectedRoute(pathname)) {
    const role = await resolveRole(supabase, data.user.id, data.user.email ?? "", data.user);
    if (!internalRoles.has(role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.searchParams.set("auth", "insufficient_role");
      return NextResponse.redirect(url);
    }
    if (isAdminProtectedRoute(pathname) && !isOperationalTestingRoute(pathname) && !adminRoles.has(role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/supervisor";
      url.searchParams.set("auth", "admin_role_required");
      return NextResponse.redirect(url);
    }
  }

  return withSecurityHeaders(response);
}

function isDeprecatedMerchantRoute(pathname: string) {
  return deprecatedMerchantPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function normalizeDashboardPath(pathname: string) {
  return pathname.startsWith("/apps/dashboard/") ? pathname.slice("/apps/dashboard".length) : pathname;
}

function isDeprecatedMerchantAuthRoute(pathname: string) {
  return deprecatedMerchantAuthPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isInternalProtectedRoute(pathname: string) {
  if (pathname === "/supervisor/login" || pathname.startsWith("/supervisor/login/")) {
    return false;
  }

  return internalProtectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAdminProtectedRoute(pathname: string) {
  return adminProtectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isOperationalTestingRoute(pathname: string) {
  return operationalTestingPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedRoute(pathname: string) {
  return isInternalProtectedRoute(pathname) || pathname.startsWith("/api");
}

function isPublicApiRoute(pathname: string) {
  return publicApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isCustomerApiRoute(pathname: string) {
  return customerApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function resolveRole(
  supabase: any,
  userId: string,
  email: string,
  user?: {
    app_metadata?: Record<string, unknown> | null;
    user_metadata?: Record<string, unknown> | null;
  }
) {
  if (isFounderEmail(email)) {
    return "founder";
  }

  const metadataRole = normalizeRoleClaim(
    user?.app_metadata?.app_role ??
      user?.app_metadata?.role ??
      user?.user_metadata?.app_role ??
      user?.user_metadata?.role
  );
  if (metadataRole) {
    return metadataRole;
  }

  try {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .or(`id.eq.${userId},email.eq.${email.toLowerCase()}`)
      .maybeSingle();
    return typeof data?.role === "string" ? data.role : "customer";
  } catch {
    return "customer";
  }
}

function isFounderEmail(email: string) {
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

function normalizeRoleClaim(value: unknown) {
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

function extractBearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length);
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/application-status/:path*",
    "/settings/:path*",
    "/login",
    "/signin",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/supervisor/:path*",
    "/executive/:path*",
    "/manager-agent/:path*",
    "/acquisition/:path*",
    "/leads/:path*",
    "/merchants/:path*",
    "/lenders/:path*",
    "/outreach/:path*",
    "/testing/:path*",
    "/reports/:path*",
    "/audit/:path*",
    "/prompts/:path*",
    "/ai-prompts/:path*",
    "/admin/:path*",
    "/operations/:path*",
    "/apps/dashboard/:path*",
    "/api/:path*",
    "/signin",
    "/apply",
    "/funding-solutions",
    "/contact"
  ]
};
