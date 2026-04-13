import { auth } from "@clerk/nextjs/server";
import { TRPCError } from "@trpc/server";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ensureUser } from "./auth";

export const createTRPCContext = async () => {
  try {
    const { userId } = await auth();
    // Read judge token from httpOnly cookie if available
    let judgeToken: string | null = null;
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      judgeToken = cookieStore.get("judge_token")?.value ?? null;
    } catch {
      // cookies() not available (e.g., tests or non-Next.js context)
    }
    return { userId: userId ?? null, judgeToken };
  } catch {
    return { userId: null, judgeToken: null };
  }
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  await ensureUser(ctx.userId);

  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);
