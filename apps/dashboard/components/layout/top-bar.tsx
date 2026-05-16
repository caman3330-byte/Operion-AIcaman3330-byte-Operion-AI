import { Bell, LockKeyhole, Search } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { getAlertsData } from "@/lib/data/live-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export async function TopBar() {
  const { data: alerts } = await getAlertsData();
  const criticalAlerts = alerts.filter((alert) => alert.severity === "CRITICAL").length;
  const unresolvedAlerts = alerts.filter((alert) => !alert.resolved).length;

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-background/80 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="hidden min-w-0 flex-1 md:block">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search leads, lenders, workflows" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-between md:hidden">
          <span className="text-sm font-semibold text-primary">Operion AI</span>
          <span className="text-xs text-muted-foreground">Operator</span>
        </div>
        <Button variant="outline" size="sm" className="relative">
          <Bell className="h-4 w-4" />
          <span>Alerts</span>
          {unresolvedAlerts > 0 ? (
            <span className={criticalAlerts > 0 ? "ml-1 text-destructive" : "ml-1 text-warning-foreground"}>
              {unresolvedAlerts}
            </span>
          ) : null}
        </Button>
        <Button variant="ghost" size="icon" aria-label="Founder access">
          <LockKeyhole className="h-4 w-4" />
        </Button>
        <LogoutButton redirectTo="/supervisor/login" />
      </div>
    </header>
  );
}
