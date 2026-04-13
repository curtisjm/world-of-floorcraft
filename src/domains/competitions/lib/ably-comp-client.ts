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

// ── Connection status ──────────────────────────────────────────────

export type CompConnectionStatus =
  | "connected"
  | "disconnected"
  | "suspended"
  | "failed";

// ── Low-level hook: subscribe to comp live + results channels ─────

type EventHandlers = Record<string, (data: unknown) => void>;

export function useCompLive(
  competitionId: number | undefined,
  handlers: EventHandlers,
  options?: { onReconnect?: () => void },
) {
  const utils = trpc.useUtils();
  const handlersRef = useRef(handlers);
  const onReconnectRef = useRef(options?.onReconnect);
  const [connectionStatus, setConnectionStatus] =
    useState<CompConnectionStatus>("disconnected");
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    onReconnectRef.current = options?.onReconnect;
  }, [options?.onReconnect]);

  useEffect(() => {
    if (!competitionId) return;

    let disposed = false;

    const getToken = () =>
      utils.liveView.getAblyToken.fetch({ competitionId }) as Promise<Ably.TokenRequest>;

    const client = acquireCompAblyClient(getToken);
    const liveChannel = client.channels.get(`comp:${competitionId}:live`);
    const resultsChannel = client.channels.get(`comp:${competitionId}:results`);

    const handler = (msg: Ably.Message) => {
      if (disposed) return;
      if (!msg.name) return;
      const fn = handlersRef.current[msg.name];
      if (fn) fn(msg.data);
    };

    liveChannel.subscribe(handler);
    resultsChannel.subscribe(handler);

    const onStateChange = (stateChange: Ably.ConnectionStateChange) => {
      if (disposed) return;
      const state = stateChange.current;

      if (state === "connected") {
        if (wasConnectedRef.current) {
          onReconnectRef.current?.();
        }
        wasConnectedRef.current = true;
        setConnectionStatus("connected");
      } else if (state === "suspended") {
        setConnectionStatus("suspended");
      } else if (state === "failed") {
        setConnectionStatus("failed");
      } else {
        setConnectionStatus("disconnected");
      }
    };

    client.connection.on(onStateChange);

    // Set initial state
    if (client.connection.state === "connected") {
      wasConnectedRef.current = true;
      setConnectionStatus("connected");
    } else if (client.connection.state === "suspended") {
      setConnectionStatus("suspended");
    } else if (client.connection.state === "failed") {
      setConnectionStatus("failed");
    }

    return () => {
      disposed = true;
      client.connection.off(onStateChange);
      liveChannel.unsubscribe(handler);
      resultsChannel.unsubscribe(handler);
      releaseCompAblyClient();
      setConnectionStatus("disconnected");
      wasConnectedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  return {
    isConnected: connectionStatus === "connected",
    connectionStatus,
  };
}

// ── Convenience hook: auto-invalidate tRPC queries on events ──────

export function useCompLiveWithInvalidation(competitionId: number | undefined) {
  const utils = trpc.useUtils();

  const invalidateAll = () => {
    utils.registrationTable.getRegistrationTable.invalidate();
    utils.scrutineerDashboard.getDashboard.invalidate();
    utils.scrutineerDashboard.getEventProgress.invalidate();
    utils.deckCaptain.getCheckinView.invalidate();
    utils.deckCaptain.getScheduleView.invalidate();
    utils.emcee.getEmceeView.invalidate();
    utils.liveView.getSchedule.invalidate();
    utils.liveView.getPublishedResults.invalidate();
  };

  const { isConnected, connectionStatus } = useCompLive(
    competitionId,
    {
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
    },
    { onReconnect: invalidateAll },
  );

  return { isConnected, connectionStatus };
}
