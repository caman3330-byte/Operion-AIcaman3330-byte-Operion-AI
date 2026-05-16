import { MailCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function OutreachHealth() {
  const sparkline = [36, 42, 34, 51, 49, 58, 62, 54, 65, 71, 66, 74, 70, 78];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Outreach Health</CardTitle>
        <MailCheck className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Sent</p>
            <p className="text-lg font-semibold">26</p>
          </div>
          <div>
            <p className="text-muted-foreground">Open</p>
            <p className="text-lg font-semibold">41%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Reply</p>
            <p className="text-lg font-semibold">8%</p>
          </div>
        </div>
        <div className="mt-5 flex h-16 items-end gap-1">
          {sparkline.map((value, index) => (
            <div key={index} className="flex-1 rounded-sm bg-primary/80" style={{ height: `${value}%` }} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
