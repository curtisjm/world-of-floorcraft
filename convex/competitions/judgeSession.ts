import { ConvexError, v } from "convex/values";
import * as bcrypt from "bcryptjs";
import { mutation, query } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { badRequest, notFound } from "../lib/errors";
import {
  createJudgeToken,
  hashToken,
  requireJudgeAuth,
} from "./lib/judgeAuth";
import { upsertJudgeSubmission, writeFinalMarks } from "./scoring";

/**
 * Judge tablet authentication and submission API — ported from
 * `src/domains/competitions/routers/judge-session.ts`.
 *
 * Judges authenticate with the public competition code, master password, and
 * judge id. Authentication returns a JWT that subsequent calls pass in as
 * `token`. The Ably-token endpoint from the tRPC router is intentionally
 * dropped; competition live state is now subscribed via Convex queries.
 */

const AUTH_RATE_LIMIT = 5;
const AUTH_RATE_WINDOW_MS = 15 * 60 * 1000;

const authFailures = new Map<string, { count: number; resetAt: number }>();

function checkAuthRateLimit(compCode: string): void {
  const key = compCode.toUpperCase();
  const now = Date.now();
  const entry = authFailures.get(key);
  if (entry && now <= entry.resetAt && entry.count >= AUTH_RATE_LIMIT) {
    throw new ConvexError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many authentication attempts. Please try again later.",
    });
  }
}

function recordAuthFailure(compCode: string): void {
  const key = compCode.toUpperCase();
  const now = Date.now();
  const entry = authFailures.get(key);
  if (!entry || now > entry.resetAt) {
    authFailures.set(key, {
      count: 1,
      resetAt: now + AUTH_RATE_WINDOW_MS,
    });
  } else {
    entry.count++;
  }
}

// ── Authenticate ────────────────────────────────────────────────────

export const authenticate = mutation({
  args: {
    compCode: v.string(),
    masterPassword: v.string(),
    judgeId: v.id("judges"),
  },
  handler: async (ctx, args) => {
    checkAuthRateLimit(args.compCode);

    const comp = await ctx.db
      .query("competitions")
      .withIndex("by_comp_code", (q) =>
        q.eq("compCode", args.compCode.toUpperCase()),
      )
      .unique();
    if (!comp || !comp.masterPasswordHash) {
      recordAuthFailure(args.compCode);
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Invalid credentials",
      });
    }

    const valid = await bcrypt.compare(
      args.masterPassword,
      comp.masterPasswordHash,
    );
    if (!valid) {
      recordAuthFailure(args.compCode);
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Invalid credentials",
      });
    }

    const assignment = await ctx.db
      .query("competitionJudges")
      .withIndex("by_competition_judge", (q) =>
        q.eq("competitionId", comp._id).eq("judgeId", args.judgeId),
      )
      .unique();
    if (!assignment) {
      recordAuthFailure(args.compCode);
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Invalid credentials",
      });
    }

    const judge = await ctx.db.get(args.judgeId);

    // End any existing active session for this judge.
    const existingSessions = await ctx.db
      .query("judgeSessions")
      .withIndex("by_competition_judge", (q) =>
        q.eq("competitionId", comp._id).eq("judgeId", args.judgeId),
      )
      .collect();
    for (const s of existingSessions) {
      if (s.status === "active") {
        await ctx.db.patch(s._id, { status: "ended", endedAt: Date.now() });
      }
    }

    const sessionId = await ctx.db.insert("judgeSessions", {
      competitionId: comp._id,
      judgeId: args.judgeId,
      status: "active",
      tokenHash: "pending",
      startedAt: Date.now(),
    });

    const token = await createJudgeToken({
      competitionId: comp._id,
      judgeId: args.judgeId,
      sessionId,
    });
    const hash = await hashToken(token);
    await ctx.db.patch(sessionId, { tokenHash: hash });

    return {
      token,
      judgeName: judge ? `${judge.firstName} ${judge.lastName}` : "Unknown",
      competitionName: comp.name,
      competitionId: comp._id,
      judgeId: args.judgeId,
    };
  },
});

// ── Logout ──────────────────────────────────────────────────────────

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const payload = await requireJudgeAuth(ctx, args.token);
    await ctx.db.patch(payload.sessionId, {
      status: "ended",
      endedAt: Date.now(),
    });
    return { success: true };
  },
});

// ── Get active round ────────────────────────────────────────────────

export const getActiveRound = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const payload = await requireJudgeAuth(ctx, args.token);

    const actives = await ctx.db
      .query("activeRounds")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", payload.competitionId),
      )
      .collect();
    const active = actives.find((a) => a.endedAt === undefined);
    if (!active) return null;

    const round = await ctx.db.get(active.roundId);
    if (!round) return null;

    const event = await ctx.db.get(round.eventId);
    const dances = await ctx.db
      .query("eventDances")
      .withIndex("by_event_position", (q) => q.eq("eventId", round.eventId))
      .collect();
    dances.sort((a, b) => a.position - b.position);

    const roundHeats = await ctx.db
      .query("heats")
      .withIndex("by_round_number", (q) => q.eq("roundId", round._id))
      .collect();
    roundHeats.sort((a, b) => a.heatNumber - b.heatNumber);

    const coupleData: Array<{
      entryId: Id<"entries">;
      competitorNumber: number | null;
      heatNumber: number | null;
    }> = [];

    if (roundHeats.length > 0) {
      for (const heat of roundHeats) {
        const assignments = await ctx.db
          .query("heatAssignments")
          .withIndex("by_heat_entry", (q) => q.eq("heatId", heat._id))
          .collect();
        for (const a of assignments) {
          const entry = await ctx.db.get(a.entryId);
          if (entry) {
            const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
            coupleData.push({
              entryId: entry._id,
              competitorNumber: leaderReg?.competitorNumber ?? null,
              heatNumber: heat.heatNumber,
            });
          }
        }
      }
    } else {
      const eventEntries = await ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", round.eventId))
        .collect();
      for (const entry of eventEntries.filter((e) => !e.scratched)) {
        const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
        coupleData.push({
          entryId: entry._id,
          competitorNumber: leaderReg?.competitorNumber ?? null,
          heatNumber: null,
        });
      }
    }

    const submission = await ctx.db
      .query("judgeSubmissions")
      .withIndex("by_round_judge", (q) =>
        q.eq("roundId", round._id).eq("judgeId", payload.judgeId),
      )
      .unique();

    return {
      roundId: round._id,
      eventName: event?.name ?? "Unknown Event",
      eventStyle: event?.style,
      roundType: round.roundType,
      callbacksRequested: round.callbacksRequested,
      dances: dances.map((d) => d.danceName),
      couples: coupleData,
      submissionStatus: submission?.status ?? "pending",
      isFinal: round.roundType === "final",
    };
  },
});

// ── Get my submission ───────────────────────────────────────────────

export const getMySubmission = query({
  args: { token: v.string(), roundId: v.id("rounds") },
  handler: async (ctx, args) => {
    const payload = await requireJudgeAuth(ctx, args.token);

    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");

    const submission = await ctx.db
      .query("judgeSubmissions")
      .withIndex("by_round_judge", (q) =>
        q.eq("roundId", args.roundId).eq("judgeId", payload.judgeId),
      )
      .unique();

    if (round.roundType === "final") {
      const marks = await ctx.db
        .query("finalMarks")
        .withIndex("by_round_judge_dance_placement", (q) =>
          q.eq("roundId", args.roundId).eq("judgeId", payload.judgeId),
        )
        .collect();
      return {
        type: "final" as const,
        status: submission?.status ?? "pending",
        marks: marks.map((m) => ({
          entryId: m.entryId,
          danceName: m.danceName,
          placement: m.placement,
        })),
      };
    } else {
      const marks = await ctx.db
        .query("callbackMarks")
        .withIndex("by_round_judge_entry", (q) =>
          q.eq("roundId", args.roundId).eq("judgeId", payload.judgeId),
        )
        .collect();
      return {
        type: "callback" as const,
        status: submission?.status ?? "pending",
        marks: marks.map((m) => ({
          entryId: m.entryId,
          marked: m.marked,
        })),
      };
    }
  },
});

// ── Submit marks via judge tablet ───────────────────────────────────

export const submitCallbackMarks = mutation({
  args: {
    token: v.string(),
    roundId: v.id("rounds"),
    marks: v.array(
      v.object({
        entryId: v.id("entries"),
        marked: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const payload = await requireJudgeAuth(ctx, args.token);

    const actives = await ctx.db
      .query("activeRounds")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", payload.competitionId),
      )
      .collect();
    const active = actives.find(
      (a) => a.roundId === args.roundId && a.endedAt === undefined,
    );
    if (!active) {
      badRequest("This round is not currently active");
    }

    const existing = await ctx.db
      .query("callbackMarks")
      .withIndex("by_round_judge_entry", (q) =>
        q.eq("roundId", args.roundId).eq("judgeId", payload.judgeId),
      )
      .collect();
    const isResubmit = existing.length > 0;

    for (const mark of args.marks) {
      const prev = existing.find((m) => m.entryId === mark.entryId);
      if (prev) {
        if (prev.marked !== mark.marked) {
          if (isResubmit) {
            await ctx.db.insert("markCorrections", {
              roundId: args.roundId,
              judgeId: payload.judgeId,
              entryId: mark.entryId,
              oldValue: String(prev.marked),
              newValue: String(mark.marked),
              source: "judge",
              createdAt: Date.now(),
            });
          }
          await ctx.db.patch(prev._id, { marked: mark.marked });
        }
      } else {
        await ctx.db.insert("callbackMarks", {
          roundId: args.roundId,
          judgeId: payload.judgeId,
          entryId: mark.entryId,
          marked: mark.marked,
        });
      }
    }

    await upsertJudgeSubmission(ctx, args.roundId, payload.judgeId);
    return { submitted: args.marks.length };
  },
});

export const submitFinalMarks = mutation({
  args: {
    token: v.string(),
    roundId: v.id("rounds"),
    marks: v.array(
      v.object({
        entryId: v.id("entries"),
        danceName: v.string(),
        placement: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const payload = await requireJudgeAuth(ctx, args.token);
    for (const m of args.marks) {
      if (m.placement < 1) badRequest("placement must be >= 1");
    }

    const actives = await ctx.db
      .query("activeRounds")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", payload.competitionId),
      )
      .collect();
    const active = actives.find(
      (a) => a.roundId === args.roundId && a.endedAt === undefined,
    );
    if (!active) {
      badRequest("This round is not currently active");
    }

    const existing = await ctx.db
      .query("finalMarks")
      .withIndex("by_round_judge_dance_placement", (q) =>
        q.eq("roundId", args.roundId).eq("judgeId", payload.judgeId),
      )
      .collect();
    const isResubmit = existing.length > 0;
    if (isResubmit) {
      for (const mark of args.marks) {
        const prev = existing.find(
          (m) =>
            m.entryId === mark.entryId && m.danceName === mark.danceName,
        );
        if (prev && prev.placement !== mark.placement) {
          await ctx.db.insert("markCorrections", {
            roundId: args.roundId,
            judgeId: payload.judgeId,
            entryId: mark.entryId,
            danceName: mark.danceName,
            oldValue: String(prev.placement),
            newValue: String(mark.placement),
            source: "judge",
            createdAt: Date.now(),
          });
        }
      }
    }

    await writeFinalMarks(ctx, args.roundId, payload.judgeId, args.marks);
    await upsertJudgeSubmission(ctx, args.roundId, payload.judgeId);
    return { submitted: args.marks.length };
  },
});

