"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

// User avatar: shows the photo if set, otherwise a person icon placeholder
// (never initials or a "?"). Used in the topbar, sidebar, and profile page.
// If the image URL fails to load (e.g. a missing/expired object), it falls
// back to the icon instead of showing a broken-image glyph.
export function UserAvatar({
  src,
  className,
  iconClassName,
}: {
  src?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  // Reset the error state whenever the source changes so a new URL is retried.
  useEffect(() => setFailed(false), [src]);
  const showImg = src && !failed;

  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-foreground text-background",
        className,
      )}
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Profile"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <User className={cn("h-1/2 w-1/2", iconClassName)} strokeWidth={2} />
      )}
    </span>
  );
}
