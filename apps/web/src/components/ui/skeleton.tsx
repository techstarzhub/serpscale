import { cn } from "@/lib/utils";

// A shimmering placeholder block. Compose these to mirror real layout while data
// loads.
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-md bg-secondary", className)} style={style} />;
}
