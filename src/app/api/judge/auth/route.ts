import { cookies } from "next/headers";
import { ConvexError } from "convex/values";
import { fetchAction } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export async function POST(req: Request) {
  const body = await req.json();

  try {
    const result = await fetchAction(
      api.competitions.judgeSession.authenticate,
      {
        compCode: body.compCode,
        masterPassword: body.masterPassword,
        judgeId: body.judgeId as Id<"judges">,
      },
    );

    const cookieStore = await cookies();
    cookieStore.set("judge_token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return Response.json({
      judgeName: result.judgeName,
      competitionName: result.competitionName,
      competitionId: result.competitionId,
      judgeId: result.judgeId,
    });
  } catch (err: unknown) {
    let code: string | undefined;
    let message: string | undefined;
    if (err instanceof ConvexError) {
      const data = err.data as { code?: string; message?: string };
      code = data?.code;
      message = data?.message;
    } else if (err instanceof Error) {
      message = err.message;
    }
    const status =
      code === "TOO_MANY_REQUESTS"
        ? 429
        : code === "UNAUTHORIZED"
          ? 401
          : 400;
    return Response.json(
      { error: message ?? "Authentication failed" },
      { status },
    );
  }
}
