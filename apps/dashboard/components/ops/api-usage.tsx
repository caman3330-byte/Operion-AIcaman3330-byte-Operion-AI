import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const usage = [
  { label: "Anthropic", value: 38, amount: "$18" },
  { label: "Apollo", value: 24, amount: "$12" },
  { label: "SendGrid", value: 8, amount: "$4" },
  { label: "Stripe", value: 0, amount: "$0" }
];

export function ApiUsage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>API Usage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-2xl font-semibold tracking-normal">$34</div>
          <p className="text-sm text-muted-foreground">Today against configured budget</p>
        </div>
        <div className="space-y-3">
          {usage.map((item) => (
            <div key={item.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span>{item.label}</span>
                <span className="text-muted-foreground">{item.amount}</span>
              </div>
              <div className="h-2 rounded-sm bg-muted">
                <div className="h-2 rounded-sm bg-primary" style={{ width: `${item.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
