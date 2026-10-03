import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const access = await getInternalPageAccess();
  if (!access.allowed) {
    return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
  }

  return (
    <div className="operations-shell min-h-screen bg-background text-foreground">
      <Sidebar role={access.role} />
      <div className="min-w-0 min-h-screen md:pl-72">
        <TopBar />
        <main className="min-w-0 overflow-x-clip px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
