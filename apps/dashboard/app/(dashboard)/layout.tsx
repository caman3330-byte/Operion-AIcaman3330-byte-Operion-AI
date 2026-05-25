import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { resolveUserRole } from "@/lib/auth";
import { getServerSessionUser } from "@/lib/supabase/session";

const internalRoles = new Set(["staff", "supervisor", "founder", "super_admin", "admin", "operator", "analyst"]);

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getServerSessionUser();
  if (!user?.email) {
    return <ProtectedRedirect to="/supervisor/login" reason="Internal operator session required" />;
  }

  const role = await resolveUserRole(user.id, user.email, user);
  if (!internalRoles.has(role)) {
    return <ProtectedRedirect to="/unauthorized?auth=insufficient_role" reason="Internal operator role required" />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="min-h-screen md:pl-72">
        <TopBar />
        <main className="px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function ProtectedRedirect({ to, reason }: { to: string; reason: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <meta httpEquiv="refresh" content={`0;url=${to}`} />
      <script dangerouslySetInnerHTML={{ __html: `window.location.replace(${JSON.stringify(to)});` }} />
      <div className="max-w-md rounded-lg border border-white/[0.10] bg-card p-6 text-center shadow-xl shadow-black/20">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Operion Capital</p>
        <h1 className="mt-3 text-xl font-semibold text-white">Redirecting to secure access</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{reason}.</p>
        <a href={to} className="mt-4 inline-flex rounded-md border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10">
          Continue
        </a>
      </div>
    </main>
  );
}
