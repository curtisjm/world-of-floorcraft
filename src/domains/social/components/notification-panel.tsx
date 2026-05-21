"use client";

import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { ScrollArea } from "@shared/ui/scroll-area";
import { Skeleton } from "@shared/ui/skeleton";
import { NotificationItem } from "./notification-item";

// ── Time-group helpers ─────────────────────────────────────────────────────────

function getGroup(date: Date | string): "Today" | "This Week" | "Earlier" {
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

// ── Component ─────────────────────────────────────────────────────────────────

export function NotificationPanel() {
  const utils = trpc.useUtils();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    trpc.notification.list.useInfiniteQuery(
      { limit: 20 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  const markReadMutation = trpc.notification.markRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const markAllReadMutation = trpc.notification.markAllRead.useMutation({
    onSuccess: () => {
      utils.notification.list.invalidate();
      utils.notification.unreadCount.invalidate();
    },
  });

  const allNotifications =
    data?.pages.flatMap((page) => page.notifications) ?? [];

  // Group by time bucket
  const grouped: Record<Group, typeof allNotifications> = {
    Today: [],
    "This Week": [],
    Earlier: [],
  };

  for (const item of allNotifications) {
    const group = getGroup(new Date(item.notification.createdAt));
    grouped[group].push(item);
  }

  function handleRead(notificationId: number) {
    markReadMutation.mutate({ notificationId });
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
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending || allNotifications.length === 0}
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

        {!isLoading && allNotifications.length === 0 && (
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
                  key={notification.id}
                  notification={notification}
                  actor={actor}
                  onRead={handleRead}
                />
              ))}
            </div>
          );
        })}

        {/* Load more */}
        {hasNextPage && (
          <div className="px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
