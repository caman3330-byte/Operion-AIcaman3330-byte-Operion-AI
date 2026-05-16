"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("operion_app_error", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-card/90 p-6 shadow-2xl shadow-black/20">
        <p className="text-sm font-semibold text-primary">Operion Capital</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Something needs attention</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The application hit a runtime error. The event has been surfaced to the local console for operator review.
        </p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </section>
    </main>
  );
}
