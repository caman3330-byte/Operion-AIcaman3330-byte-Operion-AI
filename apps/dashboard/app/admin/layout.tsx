import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { getInternalPageAccess, ProtectedPageRedirect } from "@/components/layout/protected-page";
import { operionBrand } from "@/lib/brand/operion";

export const metadata = {
  title: operionBrand.metadata.adminTitle
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getInternalPageAccess();
  if (!access.allowed) {
    return <ProtectedPageRedirect to={access.to} reason={access.reason} />;
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
