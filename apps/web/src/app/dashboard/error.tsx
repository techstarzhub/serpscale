"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Localized fallback so a thrown render error (bad API payload, etc.) shows a
// recoverable card instead of white-screening the whole dashboard.
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard error boundary:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md py-10">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-destructive/10 text-destructive"><AlertTriangle className="h-7 w-7" /></span>
          <div>
            <h2 className="font-heading text-lg font-semibold">Something went wrong</h2>
            <p className="mt-1 text-sm text-muted-foreground">This section hit an error. You can retry — the rest of the app is unaffected.</p>
          </div>
          <Button onClick={reset} className="gap-2"><RotateCcw className="h-4 w-4" /> Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
