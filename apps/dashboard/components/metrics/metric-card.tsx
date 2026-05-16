import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
}

const toneClass = {
  default: "bg-primary/12 text-primary",
  success: "bg-emerald-400/12 text-emerald-300",
  warning: "bg-amber-400/12 text-amber-300",
  danger: "bg-red-400/12 text-red-300"
};

export function MetricCard({ title, value, detail, icon: Icon, tone = "default" }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <span className={cn("rounded-md p-2", toneClass[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-normal text-white">{value}</div>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
