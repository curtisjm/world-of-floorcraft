"use client";

import { Badge } from "@shared/ui/badge";
import { cn } from "@shared/lib/utils";

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-muted text-muted-foreground",
  },
  advertised: {
    label: "Advertised",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  accepting_entries: {
    label: "Accepting Entries",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  entries_closed: {
    label: "Entries Closed",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  running: {
    label: "Running",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 animate-pulse",
  },
  finished: {
    label: "Finished",
    className: "bg-muted text-muted-foreground",
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
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge
      variant="secondary"
      className={cn("font-medium border-0", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
