"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@shared/lib/trpc";
import { useAuth } from "@clerk/nextjs";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "./typing-indicator";
import {
  useConversationMessages,
  useTypingIndicator,
} from "@messaging/lib/ably-client";
import { ScrollArea } from "@shared/ui/scroll-area";

interface ChatAreaProps {
  conversationId: number;
}

interface SenderInfo {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface FlatMessage {
  id: number;
  body: string;
  createdAt: string;
  conversationId: number;
  senderId: string;
  sender: SenderInfo | null;
}

export function ChatArea({ conversationId }: ChatAreaProps) {
  const { userId } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [realtimeMessages, setRealtimeMessages] = useState<FlatMessage[]>([]);

  const { data, isLoading, fetchNextPage, hasNextPage } =
    trpc.message.history.useInfiniteQuery(
      { conversationId, limit: 50 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor }
    );

  // Mark as read when opening
  const markReadMutation = trpc.conversation.markRead.useMutation();
  useEffect(() => {
    markReadMutation.mutate({ conversationId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Subscribe to real-time messages
  useConversationMessages(conversationId, (msg) => {
    const payload = msg.data as {
      id: number;
      body: string;
      createdAt: string;
      senderId: string;
      sender?: SenderInfo | null;
    };
    setRealtimeMessages((prev) => [
      ...prev,
      { ...payload, conversationId, sender: payload.sender ?? null },
    ]);
  });

  // Reset realtime messages when conversation changes
  useEffect(() => {
    setRealtimeMessages([]);
  }, [conversationId]);

  // Typing indicator
  const { typingUsers, sendTyping } = useTypingIndicator(conversationId);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTyping = useCallback(() => {
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), 2000);
  }, [sendTyping]);

  const handleStopTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    sendTyping(false);
  }, [sendTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const allDbItems = data?.pages.flatMap((p) => p.items) ?? [];

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [realtimeMessages.length, allDbItems.length]);

  // Merge db rows (Date createdAt) with realtime rows (string createdAt)
  const dbMessages: FlatMessage[] = allDbItems.map((item) => ({
    id: item.id,
    body: item.body,
    createdAt:
      typeof item.createdAt === "string"
        ? item.createdAt
        : (item.createdAt as Date).toISOString(),
    conversationId: item.conversationId,
    senderId: item.senderId,
    sender: item.sender ?? null,
  }));

  const allMessages = [...dbMessages, ...realtimeMessages];

  // Deduplicate by ID
  const seen = new Set<number>();
  const deduped = allMessages.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4">
        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            className="w-full text-center text-sm text-muted-foreground py-2 hover:underline"
          >
            Load older messages
          </button>
        )}
        {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}
        <div className="space-y-4">
          {deduped.map((m) => (
            <MessageBubble
              key={m.id}
              message={{ body: m.body, createdAt: m.createdAt }}
              sender={{
                id: m.senderId,
                displayName: m.sender?.displayName ?? null,
                username: m.sender?.username ?? m.senderId,
                avatarUrl: m.sender?.avatarUrl ?? null,
              }}
              isOwnMessage={m.senderId === userId}
            />
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <TypingIndicator
        typingUsers={typingUsers}
        userNames={
          new Map(
            deduped
              .filter((m) => m.sender)
              .map((m) => [
                m.senderId,
                m.sender!.displayName ?? m.sender!.username ?? m.senderId,
              ])
          )
        }
        currentUserId={userId ?? ""}
      />

      <MessageInput
        conversationId={conversationId}
        onTyping={handleTyping}
        onBlur={handleStopTyping}
        onSend={handleStopTyping}
      />
    </div>
  );
}
