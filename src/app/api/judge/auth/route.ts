import { cookies } from "next/headers";
import { appRouter } from "@shared/auth/routers";
import { createTRPCContext } from "@shared/auth/trpc";

export async function POST(req: Request) {
  const body = await req.json();
  const ctx = await createTRPCContext();
  const caller = appRouter.createCaller(ctx);

  try {
    const result = await caller.judgeSession.authenticate({
      compCode: body.compCode,
      masterPassword: body.masterPassword,
      judgeId: body.judgeId,
    });

    // Set httpOnly cookie with the JWT
    const cookieStore = await cookies();
    cookieStore.set("judge_token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours (matches JWT expiry)
    });

    // Return non-sensitive data only — token stays in httpOnly cookie
    return Response.json({
      judgeName: result.judgeName,
      competitionName: result.competitionName,
      competitionId: result.competitionId,
      judgeId: result.judgeId,
    });
  } catch (err: unknown) {
    const trpcErr = err as { code?: string; message?: string };
    const status =
      trpcErr.code === "TOO_MANY_REQUESTS" ? 429 :
      trpcErr.code === "UNAUTHORIZED" ? 401 : 400;
    return Response.json(
      { error: trpcErr.message ?? "Authentication failed" },
      { status },
    );
  }
}
