import { vi } from "vitest";

// Mock @clerk/nextjs/server -- routers import trpc.ts which imports auth from Clerk
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: null }),
  clerkMiddleware: () => (req: unknown, res: unknown, next: () => void) => next(),
  createRouteMatcher: () => () => false,
}));

// Mock @clerk/nextjs -- some components may import this
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ userId: null, isSignedIn: false }),
  useUser: () => ({ user: null }),
  SignedIn: ({ children }: { children: unknown }) => children,
  SignedOut: ({ children }: { children: unknown }) => children,
  UserButton: () => null,
  ClerkProvider: ({ children }: { children: unknown }) => children,
}));

// Mock Ably server -- messaging routers publish to Ably on send
vi.mock("@messaging/lib/ably-server", () => ({
  publishToConversation: vi.fn().mockResolvedValue(undefined),
  createAblyTokenRequest: vi.fn().mockResolvedValue({ token: "test-token" }),
  getAblyServer: vi.fn(),
}));

// Mock Ably competition channels -- judge/scrutineer routers publish to Ably
vi.mock("@competitions/lib/ably-comp", () => ({
  publishToJudging: vi.fn().mockResolvedValue(undefined),
  publishToResults: vi.fn().mockResolvedValue(undefined),
  publishToLive: vi.fn().mockResolvedValue(undefined),
  createJudgeAblyToken: vi.fn().mockResolvedValue({ token: "test-ably-token" }),
  createScrutineerAblyToken: vi.fn().mockResolvedValue({ token: "test-ably-token" }),
  createPublicAblyToken: vi.fn().mockResolvedValue({ token: "test-public-token" }),
  judgingChannel: (id: number) => `comp:${id}:judging`,
  submissionsChannel: (id: number) => `comp:${id}:submissions`,
  resultsChannel: (id: number) => `comp:${id}:results`,
  liveChannel: (id: number) => `comp:${id}:live`,
}));

// Mock @shared/db -- redirect to test database
vi.mock("@shared/db", async () => {
  const { getTestDb } = await import("./test-db");
  const db = getTestDb();
  return {
    db: db,
    getDb: () => db,
  };
});
