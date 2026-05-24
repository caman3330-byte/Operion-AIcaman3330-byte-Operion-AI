import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";

export const metadata = {
  title: "Operion Capital Admin"
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="min-h-screen md:pl-80">
        <TopBar />
        <main className="px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
