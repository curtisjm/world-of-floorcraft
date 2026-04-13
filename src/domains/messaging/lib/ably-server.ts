import Ably from "ably";

let ablyServer: Ably.Rest | null = null;

export function getAblyServer(): Ably.Rest {
  if (!ablyServer) {
    const apiKey = process.env.ABLY_API_KEY;
    if (!apiKey) throw new Error("ABLY_API_KEY not set");
    ablyServer = new Ably.Rest({ key: apiKey });
  }
  return ablyServer;
}

export async function publishToConversation(conversationId: number, event: string, data: unknown) {
  const ably = getAblyServer();
  const channel = ably.channels.get(`conversation:${conversationId}`);
  await channel.publish(event, data);
}

export async function createAblyTokenRequest(userId: string, conversationIds: number[]) {
  const ably = getAblyServer();
  const capability: Record<string, string[]> = {};
  for (const id of conversationIds) {
    capability[`conversation:${id}`] = ["subscribe", "presence", "publish"];
  }
  if (conversationIds.length === 0) {
    capability["conversation:none"] = ["subscribe"];
  }
  return ably.auth.createTokenRequest({
    clientId: userId,
    capability: JSON.stringify(capability),
  });
}
