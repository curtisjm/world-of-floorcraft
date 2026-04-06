import Ably from "ably";

let ablyServer: Ably.Rest | null = null;

function getAblyServer(): Ably.Rest {
  if (!ablyServer) {
    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) throw new Error("ABLY_API_KEY not set");
    ablyServer = new Ably.Rest({ key: apiKey });
  }
  return ablyServer;
}

// ── Channel names ──────────────────────────────────────────────────

export function judgingChannel(compId: number) {
  return `comp:${compId}:judging`;
}
export function submissionsChannel(compId: number) {
  return `comp:${compId}:submissions`;
}
export function resultsChannel(compId: number) {
  return `comp:${compId}:results`;
}
export function liveChannel(compId: number) {
  return `comp:${compId}:live`;
}

// ── Publishing ─────────────────────────────────────────────────────

export async function publishToJudging(compId: number, event: string, data: unknown) {
  const ably = getAblyServer();
  const channel = ably.channels.get(judgingChannel(compId));
  await channel.publish(event, data);
}

export async function publishToResults(compId: number, event: string, data: unknown) {
  const ably = getAblyServer();
  const channel = ably.channels.get(resultsChannel(compId));
  await channel.publish(event, data);
}

export async function publishToLive(compId: number, event: string, data: unknown) {
  const ably = getAblyServer();
  const channel = ably.channels.get(liveChannel(compId));
  await channel.publish(event, data);
}

// ── Token for judge tablets ────────────────────────────────────────

export async function createJudgeAblyToken(compId: number, judgeId: number) {
  const ably = getAblyServer();
  const capability: Record<string, string[]> = {
    [judgingChannel(compId)]: ["subscribe"],
    [submissionsChannel(compId)]: ["publish"],
  };
  return ably.auth.createTokenRequest({
    clientId: `judge:${judgeId}`,
    capability: JSON.stringify(capability),
  });
}

// ── Token for scrutineer ───────────────────────────────────────────

export async function createScrutineerAblyToken(compId: number, userId: string) {
  const ably = getAblyServer();
  const capability: Record<string, string[]> = {
    [judgingChannel(compId)]: ["subscribe", "publish"],
    [submissionsChannel(compId)]: ["subscribe"],
    [resultsChannel(compId)]: ["subscribe", "publish"],
    [liveChannel(compId)]: ["subscribe", "publish"],
  };
  return ably.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify(capability),
  });
}

// ── Token for public live view (unauthenticated) ──────────────────

export async function createPublicAblyToken(compId: number) {
  const ably = getAblyServer();
  const capability: Record<string, string[]> = {
    [liveChannel(compId)]: ["subscribe"],
    [resultsChannel(compId)]: ["subscribe"],
  };
  return ably.auth.createTokenRequest({
    clientId: `public:${compId}:${Date.now()}`,
    capability: JSON.stringify(capability),
  });
}
