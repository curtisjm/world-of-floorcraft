"use client";

import Ably from "ably";
import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@shared/lib/trpc";

let ablyClient: Ably.Realtime | null = null;
let refCount = 0;
let currentGetToken: (() => Promise<Ably.TokenRequest>) | null = null;

function acquireAblyClient(
  getToken: () => Promise<Ably.TokenRequest>
): Ably.Realtime {
  refCount++;
  // Always update the token fetcher so the authCallback uses the latest mutation
  currentGetToken = getToken;

  if (!ablyClient) {
    ablyClient = new Ably.Realtime({
      authCallback: async (_data, callback) => {
        try {
          const tokenRequest = await currentGetToken!();
          callback(null, tokenRequest);
        } catch (err) {
          callback(err as string, null);
        }
      },
    });
  }
  return ablyClient;
}

function releaseAblyClient() {
  refCount--;
  if (refCount <= 0) {
    refCount = 0;
    ablyClient?.close();
    ablyClient = null;
    currentGetToken = null;
  }
}

export function useConversationMessages(
  conversationId: number,
  onMessage: (message: Ably.Message) => void
) {
  const getTokenMutation = trpc.ablyAuth.getToken.useMutation();
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    const client = acquireAblyClient(() => getTokenMutation.mutateAsync());
    const channel = client.channels.get(`conversation:${conversationId}`);

    const handler = (msg: Ably.Message) => {
      onMessageRef.current(msg);
    };

    channel.subscribe("message", handler);

    return () => {
      channel.unsubscribe("message", handler);
      releaseAblyClient();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);
}

export function useConversationPresence(conversationId: number) {
  const getTokenMutation = trpc.ablyAuth.getToken.useMutation();
  const [presentMembers, setPresentMembers] = useState<string[]>([]);

  useEffect(() => {
    const client = acquireAblyClient(() => getTokenMutation.mutateAsync());
    const channel = client.channels.get(`conversation:${conversationId}`);

    channel.presence.subscribe(() => {
      channel.presence
        .get()
        .then((members) => {
          setPresentMembers(members.map((m) => m.clientId));
        })
        .catch(() => {});
    });

    channel.presence.enter();

    return () => {
      channel.presence.unsubscribe();
      channel.presence.leave();
      releaseAblyClient();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  return presentMembers;
}

export function useTypingIndicator(conversationId: number) {
  const getTokenMutation = trpc.ablyAuth.getToken.useMutation();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);

  useEffect(() => {
    const client = acquireAblyClient(() => getTokenMutation.mutateAsync());
    const channel = client.channels.get(`conversation:${conversationId}`);
    channelRef.current = channel;

    const handler = (msg: Ably.Message) => {
      const { userId, isTyping } = msg.data as {
        userId: string;
        isTyping: boolean;
      };
      setTypingUsers((prev) => {
        if (isTyping) {
          return prev.includes(userId) ? prev : [...prev, userId];
        } else {
          return prev.filter((id) => id !== userId);
        }
      });
    };

    channel.subscribe("typing", handler);

    return () => {
      channel.unsubscribe("typing", handler);
      channelRef.current = null;
      releaseAblyClient();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const sendTyping = useCallback((isTyping: boolean) => {
    channelRef.current?.publish("typing", {
      userId: ablyClient?.auth.clientId,
      isTyping,
    });
  }, []);

  return { typingUsers, sendTyping };
}
