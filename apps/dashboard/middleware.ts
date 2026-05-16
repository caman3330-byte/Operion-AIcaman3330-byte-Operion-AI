import { createServerClient } from "@supabase/ssr";
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
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!configured) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request
  });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
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
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          if (options) {
            response.cookies.set(name, value, options);
          } else {
            response.cookies.set(name, value);
          }
        });
      }
    }
  });

  const { data } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
