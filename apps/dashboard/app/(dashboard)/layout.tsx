import { redirect } from "next/navigation";
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
    redirect("/supervisor/login");
  }

  const role = await resolveUserRole(user.id, user.email, user);
  if (!internalRoles.has(role)) {
    redirect("/unauthorized?auth=insufficient_role");
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
