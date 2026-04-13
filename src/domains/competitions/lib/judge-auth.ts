import { SignJWT, jwtVerify } from "jose";
import { TRPCError } from "@trpc/server";
import { eq, and } from "drizzle-orm";
import { db } from "@shared/db";
import { judgeSessions } from "@competitions/schema";

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
  competitionId: number;
  judgeId: number;
  sessionId: number;
}

export async function createJudgeToken(payload: JudgeTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getJwtSecret());
}

export async function verifyJudgeToken(token: string): Promise<JudgeTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return {
      competitionId: payload.competitionId as number,
      judgeId: payload.judgeId as number,
      sessionId: payload.sessionId as number,
    };
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid or expired judge token" });
  }
}

/**
 * Validate a judge JWT, verify token hash, and check for an active session.
 * Returns the decoded payload if valid.
 */
export async function requireJudgeAuth(token: string | null | undefined): Promise<JudgeTokenPayload> {
  if (!token) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Judge token required" });
  }

  const payload = await verifyJudgeToken(token);

  // Check session is still active
  const session = await db.query.judgeSessions.findFirst({
    where: and(
      eq(judgeSessions.id, payload.sessionId),
      eq(judgeSessions.status, "active"),
    ),
  });

  if (!session) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Judge session expired or ended" });
  }

  // Verify token hash matches stored hash
  const currentHash = await hashToken(token);
  if (currentHash !== session.tokenHash) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid judge token" });
  }

  return payload;
}

/**
 * Hash a token for storage (simple SHA-256).
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
