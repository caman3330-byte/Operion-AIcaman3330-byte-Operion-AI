import { NextResponse, type NextRequest } from "next/server";

const customerProtectedPrefixes = [
  "/dashboard",
  "/application-status",
  "/settings"
];

const internalProtectedPrefixes = [
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

const internalRoles = new Set(["staff", "supervisor", "founder"]);

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Only run middleware for protected routes to avoid interfering with the public root and marketing pages.
  if (!isCustomerProtectedRoute(pathname) && !isInternalProtectedRoute(pathname) && !pathname.startsWith("/supervisor")) {
    return NextResponse.next();
  }

  let response = NextResponse.next();

  // Lazily import Supabase server client to avoid bundling server-only libs into middleware.
  let createServerClient: any;
  try {
    ({ createServerClient } = await import("@supabase/ssr"));
  } catch (err) {
    // If we cannot import Supabase in the middleware runtime, let the request proceed.
    return response;
  }

  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!configured) {
    return response;
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

  if (pathname.startsWith("/api")) {
    return response;
  }

  if (!data.user && isCustomerProtectedRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("redirectTo", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (!data.user && isInternalProtectedRoute(pathname)) {
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

async function resolveRole(
  supabase: ReturnType<typeof createServerClient>,
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
    "/signin",
    "/apply",
    "/funding-solutions",
    "/contact"
  ]
};
