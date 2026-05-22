"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { ArrowLeft } from "lucide-react";
import { MessageBubble } from "./message-bubble";
import { MessageInput } from "./message-input";
import { TypingIndicator } from "./typing-indicator";
import { ScrollArea } from "@shared/ui/scroll-area";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

interface ChatAreaProps {
  conversationId: Id<"conversations">;
}

const PRESENCE_HEARTBEAT_MS = 30_000;
const TYPING_DEBOUNCE_MS = 2_000;
const TYPING_REFRESH_MS = 2_000;
const HISTORY_PAGE_SIZE = 50;

export function ChatArea({ conversationId }: ChatAreaProps) {
  const me = useQuery(api.users.me, {});
  const scrollRef = useRef<HTMLDivElement>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.messaging.history,
    { conversationId },
    { initialNumItems: HISTORY_PAGE_SIZE },
  );

  const markRead = useMutation(api.messaging.markRead);
  const heartbeatPresence = useMutation(api.messaging.heartbeatPresence);
  const setTyping = useMutation(api.messaging.setTyping);

  // Mark as read on open and refresh when conversation changes.
  useEffect(() => {
    void markRead({ conversationId }).catch(() => {});
  }, [conversationId, markRead]);

  // Heartbeat presence while viewing this conversation.
  useEffect(() => {
    let cancelled = false;
    const beat = () => {
      if (cancelled) return;
      void heartbeatPresence({ conversationId }).catch(() => {});
    };
    beat();
    const handle = setInterval(beat, PRESENCE_HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [conversationId, heartbeatPresence]);

  // Drive `now` for the typing query so stale heartbeats fall off without
  // a Date.now() call inside the Convex query itself.
  const [typingNow, setTypingNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(
      () => setTypingNow(Date.now()),
      TYPING_REFRESH_MS,
    );
    return () => clearInterval(handle);
  }, []);

  const typingUserIds = useQuery(api.messaging.activeTyping, {
    conversationId,
    now: typingNow,
  });

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const handleTyping = useCallback(() => {
    const now = Date.now();
    // Avoid hammering the mutation on every keystroke — once a second is plenty.
    if (now - lastTypingSentRef.current > 1_000) {
      lastTypingSentRef.current = now;
      void setTyping({ conversationId, isTyping: true }).catch(() => {});
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      void setTyping({ conversationId, isTyping: false }).catch(() => {});
    }, TYPING_DEBOUNCE_MS);
  }, [conversationId, setTyping]);

  const handleStopTyping = useCallback(() => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    void setTyping({ conversationId, isTyping: false }).catch(() => {});
  }, [conversationId, setTyping]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      void setTyping({ conversationId, isTyping: false }).catch(() => {});
    };
  }, [conversationId, setTyping]);

  // history returns newest-first; show chronological top→bottom.
  const chronological = useMemo(() => [...results].reverse(), [results]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chronological.length]);

  const userNames = useMemo(() => {
    const map = new Map<Id<"users">, string>();
    for (const m of chronological) {
      if (!m.sender) continue;
      map.set(
        m.sender.id,
        m.sender.displayName ?? m.sender.username ?? m.sender.id,
      );
    }
    return map;
  }, [chronological]);

  const isLoading = status === "LoadingFirstPage";
  const canLoadMore = status === "CanLoadMore";

  return (
    <div className="flex flex-col h-full">
      {/* Mobile-only back button */}
      <div className="flex md:hidden items-center gap-2 p-3 border-b">
        <Link
          href="/messages"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Messages</span>
        </Link>
      </div>
      <ScrollArea className="flex-1 p-4">
        {canLoadMore && (
          <button
            onClick={() => loadMore(HISTORY_PAGE_SIZE)}
            className="w-full text-center text-sm text-muted-foreground py-2 hover:underline"
          >
            Load older messages
          </button>
        )}
        {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}
        <div className="space-y-4">
          {chronological.map((m) => (
            <MessageBubble
              key={m._id}
              message={{ body: m.body, createdAt: m.createdAt }}
              sender={{
                id: m.senderId,
                displayName: m.sender?.displayName ?? null,
                username: m.sender?.username ?? null,
                avatarUrl: m.sender?.avatarUrl ?? null,
              }}
              isOwnMessage={!!me && m.senderId === me._id}
            />
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <TypingIndicator
        typingUsers={typingUserIds ?? []}
        userNames={userNames}
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
