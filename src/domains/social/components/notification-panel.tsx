"use client";

import { useMutation, usePaginatedQuery } from "convex/react";
import { Button } from "@shared/ui/button";
import { ScrollArea } from "@shared/ui/scroll-area";
import { Skeleton } from "@shared/ui/skeleton";
import { NotificationItem } from "./notification-item";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";

// ── Time-group helpers ─────────────────────────────────────────────────────────

function getGroup(date: number): "Today" | "This Week" | "Earlier" {
  const d = new Date(date);
  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());

  if (d >= startOfToday) return "Today";
  if (d >= startOfWeek) return "This Week";
  return "Earlier";
}

const GROUP_ORDER = ["Today", "This Week", "Earlier"] as const;
type Group = (typeof GROUP_ORDER)[number];

interface NotificationListItem {
  notification: Doc<"notifications">;
  actor: {
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
  } | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NotificationPanel() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.social.notifications.list,
    {},
    { initialNumItems: 20 },
  );

  const markRead = useMutation(api.social.notifications.markRead);
  const markAllRead = useMutation(api.social.notifications.markAllRead);

  const isLoading = status === "LoadingFirstPage";
  const notifications = results as NotificationListItem[];

  // Group by time bucket
  const grouped: Record<Group, NotificationListItem[]> = {
    Today: [],
    "This Week": [],
    Earlier: [],
  };

  for (const item of notifications) {
    grouped[getGroup(item.notification.createdAt)].push(item);
  }

  function handleRead(notificationId: Id<"notifications">) {
    void markRead({ notificationId }).catch(() => {});
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm">Notifications</h3>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 px-2"
          onClick={() => void markAllRead({}).catch(() => {})}
          disabled={notifications.length === 0}
        >
          Mark all read
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="max-h-[500px]">
        {isLoading && (
          <div className="grid gap-2 p-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}

        {!isLoading && notifications.length === 0 && (
          <div className="atelier-empty-state atelier-empty-state-centered border-0 border-b border-border bg-popover px-4 py-8">
            <span className="atelier-empty-glyph" aria-hidden="true" />
            <p className="text-sm">No notices are waiting.</p>
          </div>
        )}

        {GROUP_ORDER.map((group) => {
          const items = grouped[group];
          if (items.length === 0) return null;

          return (
            <div key={group}>
              <p className="text-xs font-medium text-muted-foreground px-4 py-2 sticky top-0 bg-popover border-b border-border/50">
                {group}
              </p>
              {items.map(({ notification, actor }) => (
                <NotificationItem
                  key={notification._id}
                  notification={notification}
                  actor={actor}
                  onRead={handleRead}
                />
              ))}
            </div>
          );
        })}

        {/* Load more */}
        {status === "CanLoadMore" && (
          <div className="px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => loadMore(20)}
            >
              Load more
            </Button>
          </div>
        )}
        {status === "LoadingMore" && (
          <div className="px-4 py-3 text-center text-xs text-muted-foreground">
            Loading…
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
