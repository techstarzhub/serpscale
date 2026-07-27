import { User } from "lucide-react";
import { cn } from "@/lib/utils";

// User avatar: shows the photo if set, otherwise a person icon placeholder
// (never initials or a "?"). Used in the topbar, sidebar, and profile page.
export function UserAvatar({
  src,
  className,
  iconClassName,
}: {
  src?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden rounded-full bg-foreground text-background",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="Profile" className="h-full w-full object-cover" />
      ) : (
        <User className={cn("h-1/2 w-1/2", iconClassName)} strokeWidth={2} />
      )}
    </span>
  );
}
