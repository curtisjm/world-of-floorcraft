"use client";

import { Badge } from "@shared/ui/badge";
import { cn } from "@shared/lib/utils";

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "border-border bg-muted text-muted-foreground",
  },
  advertised: {
    label: "Advertised",
    className: "border-border bg-secondary text-secondary-foreground",
  },
  accepting_entries: {
    label: "Accepting Entries",
    className: "border-sage bg-[var(--sage-tint)] text-sage",
  },
  entries_closed: {
    label: "Entries Closed",
    className: "border-clay bg-[var(--clay-tint)] text-clay",
  },
  running: {
    label: "Running",
    className: "border-wine bg-[var(--wine-tint)] text-wine",
  },
  finished: {
    label: "Finished",
    className: "border-border bg-muted text-muted-foreground",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const config = statusConfig[status] ?? {
    label: status,
    className: "border-border bg-muted text-muted-foreground",
  };

  return (
    <Badge
      variant="secondary"
      className={cn("font-medium", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
