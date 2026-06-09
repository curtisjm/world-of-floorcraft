"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useConvexAuth, useQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/ui/popover";
import { cn } from "@shared/lib/utils";
import { NotificationPanel } from "./notification-panel";
import { api } from "../../../../convex/_generated/api";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated } = useConvexAuth();

  // Reactive: the unread count refreshes whenever a notification changes,
  // so no polling interval is needed.
  const unreadCount =
    useQuery(
      api.social.notifications.unreadCount,
      isAuthenticated ? {} : "skip",
    ) ?? 0;

  const displayCount = unreadCount > 99 ? "99+" : unreadCount > 0 ? String(unreadCount) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="size-5" />
          {displayCount !== null && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-wine text-destructive-foreground font-bold leading-none ring-2 ring-background",
                displayCount.length > 2
                  ? "min-w-[1.4rem] px-1 text-[0.6rem] h-[1.1rem]"
                  : "size-[1.1rem] text-[0.6rem]"
              )}
            >
              {displayCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-80 p-0"
        align="end"
        sideOffset={8}
      >
        <NotificationPanel />
      </PopoverContent>
    </Popover>
  );
}
