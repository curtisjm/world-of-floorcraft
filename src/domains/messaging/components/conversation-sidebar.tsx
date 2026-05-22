"use client";

import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ConversationItem } from "./conversation-item";
import { NewConversation } from "./new-conversation";
import { ScrollArea } from "@shared/ui/scroll-area";
import { Skeleton } from "@shared/ui/skeleton";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export function ConversationSidebar() {
  const params = useParams();
  const activeId =
    typeof params.conversationId === "string"
      ? (params.conversationId as Id<"conversations">)
      : null;

  const conversations = useQuery(api.messaging.listConversations, {});
  const isLoading = conversations === undefined;

  const dms = conversations?.filter((c) => c.type !== "org_channel") ?? [];
  const channels = conversations?.filter((c) => c.type === "org_channel") ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b bg-secondary px-4 py-3">
        <h2 className="font-mono text-xs font-medium lowercase text-muted-foreground">Messages</h2>
        <NewConversation />
      </div>
      <ScrollArea className="flex-1">
        {isLoading && (
          <div className="grid gap-2 p-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {!isLoading && dms.length === 0 && channels.length === 0 && (
          <div className="atelier-empty-state m-3">
            <span className="atelier-empty-glyph" aria-hidden="true" />
            <p className="text-sm">New conversations will collect here.</p>
          </div>
        )}

        {dms.length > 0 && (
          <div className="p-2">
            {dms.map((c) => (
              <ConversationItem
                key={c._id}
                conversation={{ _id: c._id, type: c.type, name: c.name }}
                otherUser={c.otherUser}
                lastMessage={c.lastMessage}
                unreadCount={c.unreadCount}
                isActive={activeId === c._id}
              />
            ))}
          </div>
        )}

        {channels.length > 0 && (
          <div className="p-2">
            <p className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase">
              Channels
            </p>
            {channels.map((c) => (
              <ConversationItem
                key={c._id}
                conversation={{ _id: c._id, type: c.type, name: c.name }}
                otherUser={null}
                lastMessage={c.lastMessage}
                unreadCount={c.unreadCount}
                isActive={activeId === c._id}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
