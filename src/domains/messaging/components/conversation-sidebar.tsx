"use client";

import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { ConversationItem } from "./conversation-item";
import { NewConversation } from "./new-conversation";
import { ScrollArea } from "@shared/ui/scroll-area";

export function ConversationSidebar() {
  const params = useParams();
  const activeId = params.conversationId ? Number(params.conversationId) : null;

  const { data: conversations, isLoading } = trpc.conversation.list.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const dms = conversations?.filter((c) => c.type !== "org_channel") ?? [];
  const channels = conversations?.filter((c) => c.type === "org_channel") ?? [];

  return (
    <div className="w-80 border-r flex flex-col h-full">
      <div className="p-3 border-b flex items-center justify-between">
        <h2 className="font-semibold">Messages</h2>
        <NewConversation />
      </div>
      <ScrollArea className="flex-1">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}

        {dms.length > 0 && (
          <div className="p-2">
            {dms.map((c) => (
              <ConversationItem
                key={c.id}
                conversation={{ id: c.id, type: c.type, name: c.name }}
                otherUser={c.otherUser}
                lastMessage={c.lastMessage}
                unreadCount={c.unreadCount}
                isActive={activeId === c.id}
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
                key={c.id}
                conversation={{ id: c.id, type: c.type, name: c.name }}
                otherUser={null}
                lastMessage={c.lastMessage}
                unreadCount={c.unreadCount}
                isActive={activeId === c.id}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
