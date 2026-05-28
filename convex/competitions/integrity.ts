import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { notFound } from "../lib/errors";

export const DEFAULT_FINAL_SIZE = 8;

type Ctx = QueryCtx | MutationCtx;

type AddDropRequestLike = {
  competitionId: Id<"competitions">;
  type: "add" | "drop";
  eventId: Id<"competitionEvents">;
  leaderRegistrationId: Id<"competitionRegistrations">;
  followerRegistrationId: Id<"competitionRegistrations">;
};

function badRequest(message: string): never {
  throw new ConvexError({ code: "BAD_REQUEST", message });
}

export async function computeAffectsRounds(
  ctx: Ctx,
  eventId: Id<"competitionEvents">,
  type: "add" | "drop",
  compMaxFinalSize: number | undefined,
): Promise<boolean> {
  const event = await ctx.db.get(eventId);
  if (!event) return false;
  const maxFinal =
    event.maxFinalSize ?? compMaxFinalSize ?? DEFAULT_FINAL_SIZE;
  const eventEntries = await ctx.db
    .query("entries")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .collect();
  const active = eventEntries.filter((e) => !e.scratched).length;
  if (type === "add") {
    return active === maxFinal;
  }
  return active === maxFinal + 1;
}

export async function validateAddDropRequest(
  ctx: Ctx,
  request: AddDropRequestLike,
): Promise<{
  event: Doc<"competitionEvents">;
  leaderReg: Doc<"competitionRegistrations">;
  followerReg: Doc<"competitionRegistrations">;
  matchingEntries: Doc<"entries">[];
  activeMatchingEntries: Doc<"entries">[];
}> {
  const event = await ctx.db.get(request.eventId);
  if (!event) notFound("Event not found");
  if (event.competitionId !== request.competitionId) {
    badRequest("Event does not belong to this competition");
  }

  const leaderReg = await ctx.db.get(request.leaderRegistrationId);
  const followerReg = await ctx.db.get(request.followerRegistrationId);
  if (!leaderReg || !followerReg) notFound("Registration not found");
  if (
    leaderReg.competitionId !== request.competitionId ||
    followerReg.competitionId !== request.competitionId
  ) {
    badRequest("Both registrations must belong to this competition");
  }
  if (leaderReg.userId === followerReg.userId) {
    badRequest("Leader and follower cannot be the same person");
  }

  const matchingEntries = await ctx.db
    .query("entries")
    .withIndex("by_event_couple", (q) =>
      q
        .eq("eventId", request.eventId)
        .eq("leaderRegistrationId", request.leaderRegistrationId)
        .eq("followerRegistrationId", request.followerRegistrationId),
    )
    .collect();
  const activeMatchingEntries = matchingEntries.filter((entry) => !entry.scratched);

  if (request.type === "add" && activeMatchingEntries.length > 0) {
    badRequest("Entry already exists for this event");
  }
  if (request.type === "drop" && activeMatchingEntries.length === 0) {
    badRequest("No entry exists for this event");
  }

  return { event, leaderReg, followerReg, matchingEntries, activeMatchingEntries };
}

export async function applyApprovedAddDropRequest(
  ctx: MutationCtx,
  request: Doc<"addDropRequests">,
  reviewedBy: Id<"users">,
): Promise<void> {
  const { activeMatchingEntries } = await validateAddDropRequest(ctx, request);

  if (request.type === "add") {
    await ctx.db.insert("entries", {
      competitionId: request.competitionId,
      eventId: request.eventId,
      leaderRegistrationId: request.leaderRegistrationId,
      followerRegistrationId: request.followerRegistrationId,
      createdAt: Date.now(),
      createdBy: reviewedBy,
      scratched: false,
    });
  } else {
    for (const entry of activeMatchingEntries) {
      await ctx.db.delete(entry._id);
    }
  }

  await ctx.db.patch(request._id, {
    status: "approved",
    reviewedBy,
    reviewedAt: Date.now(),
  });
}
