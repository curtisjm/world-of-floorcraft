"use client";

import Ably from "ably";
import { useEffect, useRef, useState } from "react";
import { trpc } from "@shared/lib/trpc";

// ── Singleton Ably client with ref counting ───────────────────────

let compAblyClient: Ably.Realtime | null = null;
let compRefCount = 0;
let currentTokenFetcher: (() => Promise<Ably.TokenRequest>) | null = null;

function acquireCompAblyClient(
  getToken: () => Promise<Ably.TokenRequest>,
): Ably.Realtime {
  compRefCount++;
  currentTokenFetcher = getToken;

  if (!compAblyClient) {
    compAblyClient = new Ably.Realtime({
      authCallback: async (_data, callback) => {
        try {
          const tokenRequest = await currentTokenFetcher!();
          callback(null, tokenRequest);
        } catch (err) {
          callback(err as string, null);
        }
      },
    });
  }
  return compAblyClient;
}

function releaseCompAblyClient() {
  compRefCount--;
  if (compRefCount <= 0) {
    compRefCount = 0;
    compAblyClient?.close();
    compAblyClient = null;
    currentTokenFetcher = null;
  }
}

// ── Low-level hook: subscribe to comp live + results channels ─────

type EventHandlers = Record<string, (data: unknown) => void>;

export function useCompLive(
  competitionId: number | undefined,
  handlers: EventHandlers,
) {
  const utils = trpc.useUtils();
  const handlersRef = useRef(handlers);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!competitionId) return;

    const getToken = () =>
      utils.liveView.getAblyToken.fetch({ competitionId }) as Promise<Ably.TokenRequest>;

    const client = acquireCompAblyClient(getToken);
    const liveChannel = client.channels.get(`comp:${competitionId}:live`);
    const resultsChannel = client.channels.get(`comp:${competitionId}:results`);

    const handler = (msg: Ably.Message) => {
      if (!msg.name) return;
      const fn = handlersRef.current[msg.name];
      if (fn) fn(msg.data);
    };

    liveChannel.subscribe(handler);
    resultsChannel.subscribe(handler);

    client.connection.on("connected", () => setIsConnected(true));
    client.connection.on("disconnected", () => setIsConnected(false));
    setIsConnected(client.connection.state === "connected");

    return () => {
      liveChannel.unsubscribe(handler);
      resultsChannel.unsubscribe(handler);
      releaseCompAblyClient();
      setIsConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  return { isConnected };
}

// ── Convenience hook: auto-invalidate tRPC queries on events ──────

export function useCompLiveWithInvalidation(competitionId: number | undefined) {
  const utils = trpc.useUtils();

  return useCompLive(competitionId, {
    "checkin:registration": () => {
      utils.registrationTable.getRegistrationTable.invalidate();
      utils.scrutineerDashboard.getDashboard.invalidate();
    },
    "checkin:deck": () => {
      utils.deckCaptain.getCheckinView.invalidate();
    },
    "announcement:created": () => {
      utils.emcee.getEmceeView.invalidate();
      utils.liveView.getSchedule.invalidate();
    },
    "announcement:updated": () => {
      utils.emcee.getEmceeView.invalidate();
      utils.liveView.getSchedule.invalidate();
    },
    "announcement:deleted": () => {
      utils.emcee.getEmceeView.invalidate();
      utils.liveView.getSchedule.invalidate();
    },
    "schedule:updated": () => {
      utils.scrutineerDashboard.getDashboard.invalidate();
      utils.deckCaptain.getScheduleView.invalidate();
      utils.emcee.getEmceeView.invalidate();
      utils.liveView.getSchedule.invalidate();
    },
    "event:completed": () => {
      utils.scrutineerDashboard.getDashboard.invalidate();
      utils.scrutineerDashboard.getEventProgress.invalidate();
      utils.emcee.getEmceeView.invalidate();
      utils.liveView.getSchedule.invalidate();
    },
    "results:published": () => {
      utils.liveView.getPublishedResults.invalidate();
      utils.emcee.getEmceeView.invalidate();
      utils.scrutineerDashboard.getDashboard.invalidate();
    },
  });
}
