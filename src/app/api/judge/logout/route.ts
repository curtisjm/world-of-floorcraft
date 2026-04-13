import { cookies } from "next/headers";
import { appRouter } from "@shared/auth/routers";
import { createTRPCContext } from "@shared/auth/trpc";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("judge_token")?.value;

  if (token) {
    try {
      const ctx = await createTRPCContext();
      const caller = appRouter.createCaller(ctx);
      await caller.judgeSession.logout({ token });
    } catch {
      // Best-effort session invalidation — clear cookie regardless
    }
  }

  cookieStore.delete("judge_token");
  return Response.json({ success: true });
}
