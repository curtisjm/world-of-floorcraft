/**
 * Judge tablet authentication helpers — port of
 * src/domains/competitions/lib/judge-auth.ts.
 *
 * Judges authenticate by competition code + master password + judge id, not by
 * Clerk identity, so the per-request `ctx.auth.getUserIdentity()` path used by
 * the rest of the app does not apply here. Authenticated judge mutations and
 * queries accept the JWT as an explicit `token` argument and validate it via
 * `requireJudgeAuth(ctx, token)`, which checks the JWT signature, ensures the
 * judge session row in `judgeSessions` is still active, and confirms the
 * stored SHA-256 hash matches.
 *
 * Both `jose` (HS256 sign/verify) and `crypto.subtle` (SHA-256) run inside the
 * Convex V8 runtime.
 */

import { ConvexError } from "convex/values";
import { SignJWT, jwtVerify } from "jose";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

let _jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (!_jwtSecret) {
    const secret = process.env.JUDGE_JWT_SECRET;
    if (!secret) {
      throw new Error(
        "JUDGE_JWT_SECRET environment variable is required. " +
          "Set it to a strong random string (min 32 characters).",
      );
    }
    _jwtSecret = new TextEncoder().encode(secret);
  }
  return _jwtSecret;
}

export interface JudgeTokenPayload {
  competitionId: Id<"competitions">;
  judgeId: Id<"judges">;
  sessionId: Id<"judgeSessions">;
}

export async function createJudgeToken(
  payload: JudgeTokenPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getJwtSecret());
}

export async function verifyJudgeToken(
  token: string,
): Promise<JudgeTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      competitionId: payload.competitionId as Id<"competitions">,
      judgeId: payload.judgeId as Id<"judges">,
      sessionId: payload.sessionId as Id<"judgeSessions">,
    };
  } catch {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Invalid or expired judge token",
    });
  }
}

/**
 * Validate a judge JWT, confirm the session row is active, and verify the
 * token hash matches what we stored at authentication time.
 */
export async function requireJudgeAuth(
  ctx: QueryCtx | MutationCtx,
  token: string | null | undefined,
): Promise<JudgeTokenPayload> {
  if (!token) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Judge token required",
    });
  }

  const payload = await verifyJudgeToken(token);

  const session = await ctx.db.get(payload.sessionId);
  if (!session || session.status !== "active") {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Judge session expired or ended",
    });
  }

  const currentHash = await hashToken(token);
  if (currentHash !== session.tokenHash) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Invalid judge token",
    });
  }

  return payload;
}

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
