"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@/lib/utils";

// A site's favicon in a rounded tile, with a globe fallback if it fails to load.
export function SiteFavicon({
  domain,
  className,
  iconClassName,
}: {
  domain: string;
  className?: string;
  iconClassName?: string;
}) {
  const [err, setErr] = useState(false);
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {err ? (
        <Globe className={cn("text-muted-foreground", iconClassName)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
          alt=""
          className="h-3/5 w-3/5"
          onError={() => setErr(true)}
        />
      )}
    </span>
  );
}
