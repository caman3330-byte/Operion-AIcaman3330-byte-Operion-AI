import { CheckCircle2, CircleAlert, CircleDot } from "lucide-react";
import { getConfigurationStatus } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function SystemHealth() {
  const config = getConfigurationStatus();
  const services = [
    { name: "Supabase", status: config.supabase ? "ready" : "pending", detail: config.supabase ? "Connected" : "Credential required" },
    { name: "Anthropic", status: config.anthropic ? "ready" : "pending", detail: "Qualification layer" },
    { name: "SendGrid", status: config.sendgrid ? "ready" : "pending", detail: "Outbound layer" },
    { name: "n8n", status: config.n8n ? "ready" : "pending", detail: "Workflow webhooks" },
    { name: "Apollo", status: config.apollo ? "ready" : "pending", detail: "Lead discovery" },
    { name: "Webhooks", status: config.internalApi ? "ready" : "pending", detail: "Internal API key" }
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.map((service) => (
          <div key={service.name} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {service.status === "ready" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
              ) : service.status === "warning" ? (
                <CircleAlert className="h-4 w-4 shrink-0 text-warning" />
              ) : (
                <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{service.name}</p>
                <p className="truncate text-xs text-muted-foreground">{service.detail}</p>
              </div>
            </div>
            <Badge variant={service.status === "ready" ? "success" : "secondary"}>{service.status}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
