import { NextResponse, type NextRequest } from "next/server";

const customerProtectedPrefixes = [
  "/dashboard",
  "/application-status",
  "/settings"
];

const internalProtectedPrefixes = [
  "/admin",
  "/executive",
  "/supervisor",
  "/manager-agent",
  "/acquisition",
  "/leads",
  "/lenders",
  "/outreach",
  "/testing",
  "/reports",
  "/audit",
  "/prompts",
  "/ai-prompts"
];

const publicApiPrefixes = [
  "/api/health",
  "/api/applications",
  "/api/auth/logout",
  "/api/webhooks/sendgrid"
];

const customerApiPrefixes = [
  "/api/documents/upload"
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

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Only run middleware for protected routes to avoid interfering with the public root and marketing pages.
  if (!isProtectedRoute(pathname)) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith("/api");
  let response = NextResponse.next();

  // Lazily import Supabase server client to avoid bundling server-only libs into middleware.
  let createServerClient: any;
  try {
    ({ createServerClient } = await import("@supabase/ssr"));
  } catch (err) {
    const errorPayload = { error: "middleware_auth_initialization_failed" };
    if (isApiRoute) {
      return new NextResponse(JSON.stringify(errorPayload), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("auth", "middleware_error");
    return NextResponse.redirect(url);
  }

  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!configured) {
    const errorPayload = { error: "authentication_not_configured" };
    if (isApiRoute) {
      return new NextResponse(JSON.stringify(errorPayload), {
        status: 503,
        headers: { "content-type": "application/json" }
      });
    }

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
  const internalApiKey = process.env.OPERION_INTERNAL_API_KEY;

  // Allow bypass for internal automation: if the request includes the internal API key header,
  // treat the request as authenticated for internal testing. This short-circuits middleware
  // protections for pages when running automated tests. REMOVE or restrict in production.
  if (internalApiKey && request.headers.get("x-operion-internal-key") === internalApiKey) {
    return response;
  }

  if (pathname.startsWith("/api")) {
    if (internalApiKey && request.headers.get("x-operion-internal-key") === internalApiKey) {
      return response;
    }

    if (isPublicApiRoute(pathname) || isCustomerApiRoute(pathname)) {
      return response;
    }

    if (!data.user) {
      return new NextResponse(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    const role = await resolveRole(supabase, data.user.id, data.user.email ?? "");
    if (!internalRoles.has(role)) {
      return new NextResponse(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" }
      });
    }

    return response;
  }

  if (!data.user && isCustomerProtectedRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("redirectTo", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

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
    const role = await resolveRole(supabase, data.user.id, data.user.email ?? "");
    if (!internalRoles.has(role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      url.searchParams.set("auth", "insufficient_role");
      return NextResponse.redirect(url);
    }
  }

  return response;
}

function isCustomerProtectedRoute(pathname: string) {
  return customerProtectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isInternalProtectedRoute(pathname: string) {
  if (pathname === "/supervisor/login" || pathname.startsWith("/supervisor/login/")) {
    return false;
  }

  return internalProtectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isProtectedRoute(pathname: string) {
  return isCustomerProtectedRoute(pathname) || isInternalProtectedRoute(pathname) || pathname.startsWith("/api");
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
  email: string
) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) {
    return "founder";
  }

  try {
    const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
    return typeof data?.role === "string" ? data.role : "customer";
  } catch {
    return "customer";
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/application-status/:path*",
    "/settings/:path*",
    "/supervisor/:path*",
    "/executive/:path*",
    "/manager-agent/:path*",
    "/acquisition/:path*",
    "/leads/:path*",
    "/lenders/:path*",
    "/outreach/:path*",
    "/testing/:path*",
    "/reports/:path*",
    "/audit/:path*",
    "/prompts/:path*",
    "/ai-prompts/:path*",
    "/admin/:path*",
    "/api/:path*",
    "/signin",
    "/apply",
    "/funding-solutions",
    "/contact"
  ]
};
