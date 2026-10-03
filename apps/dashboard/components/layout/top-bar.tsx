import { Bell, LockKeyhole, Search } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { getAlertsData } from "@/lib/data/live-data";
import { OperionLogo } from "@/components/brand/operion-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { operionBrand } from "@/lib/brand/operion";
import { Suspense } from "react";

export function TopBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card">
      <div className="flex min-h-14 min-w-0 items-center gap-3 px-4 py-2 sm:px-6 lg:px-7">
        <div className="hidden min-w-0 flex-1 md:block">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search merchants, lenders, workflows" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-between md:hidden">
          <OperionLogo size="sm" showTagline={false} collapseWordmarkOnMobile tone="light" />
          <span className="text-xs text-muted-foreground">{operionBrand.platformName}</span>
        </div>
        <div className="hidden text-right lg:block">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">{operionBrand.internalPlatformName}</p>
          <p className="text-[0.7rem] text-muted-foreground">Merchant acquisition & financing</p>
        </div>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          <span>Alerts</span>
          <Suspense fallback={<span className="ml-1 text-muted-foreground" aria-label="Loading alerts">...</span>}><AlertCount /></Suspense>
        </Button>
        <Button variant="ghost" size="icon" aria-label="Founder access">
          <LockKeyhole className="h-4 w-4" />
        </Button>
        <LogoutButton redirectTo="/supervisor/login" />
      </div>
    </header>
  );
}

async function AlertCount() {
  const { data: alerts, source } = await getAlertsData();
  if (source === "unavailable") return <span className="ml-1 text-muted-foreground" title="Alert data unavailable">Unavailable</span>;
  const critical = alerts.some((alert) => alert.severity === "CRITICAL");
  const count = alerts.filter((alert) => !alert.resolved).length;
  return count > 0 ? <span className={critical ? "ml-1 text-destructive" : "ml-1 text-warning-foreground"}>{count}</span> : null;
}
