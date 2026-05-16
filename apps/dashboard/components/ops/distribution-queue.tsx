import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function DistributionQueue() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribution Queue</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Pending</p>
            <p className="text-2xl font-semibold">4</p>
          </div>
          <div>
            <p className="text-muted-foreground">Delivered</p>
            <p className="text-2xl font-semibold">0</p>
          </div>
          <div>
            <p className="text-muted-foreground">Failed</p>
            <p className="text-2xl font-semibold">0</p>
          </div>
        </div>
        <Button variant="outline" className="mt-5" size="sm">
          <RotateCcw className="h-4 w-4" />
          Retry Failed
        </Button>
      </CardContent>
    </Card>
  );
}
