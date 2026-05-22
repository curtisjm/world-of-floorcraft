import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser } from "../lib/auth";
import { notFound } from "../lib/errors";
import { requireCompOrgRole, requireCompStaffRole } from "../lib/permissions";

/**
 * Competition registrations + pricing tier management + check-in. Ported
 * from `src/domains/competitions/routers/registration.ts` for Task 9 of the
 * Convex migration. Money is stored as integer cents.
 */

function pickRegAmount(
  comp: Doc<"competitions">,
  tier: Doc<"pricingTiers"> | null,
): number {
  if (tier) return tier.price;
  return comp.baseFee ?? 0;
}

async function recalcAmountOwed(
  ctx: MutationCtx,
  registrationId: Id<"competitionRegistrations">,
): Promise<void> {
  const reg = await ctx.db.get(registrationId);
  if (!reg) return;
  const comp = await ctx.db.get(reg.competitionId);
  if (!comp || comp.pricingModel !== "per_event") return;

  const leaderEntries = await ctx.db
    .query("entries")
    .withIndex("by_leader", (q) => q.eq("leaderRegistrationId", registrationId))
    .collect();
  const followerEntries = await ctx.db
    .query("entries")
    .withIndex("by_follower", (q) =>
      q.eq("followerRegistrationId", registrationId),
    )
    .collect();
  const seen = new Set<Id<"entries">>();
  let entryTotal = 0;
  for (const e of [...leaderEntries, ...followerEntries]) {
    if (e.scratched) continue;
    if (seen.has(e._id)) continue;
    seen.add(e._id);
    const event = await ctx.db.get(e.eventId);
    if (!event) continue;
    entryTotal += event.entryPrice ?? 0;
  }
  const baseFee = comp.baseFee ?? 0;
  await ctx.db.patch(registrationId, { amountOwed: baseFee + entryTotal });
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * The current user's registration for a competition, with their entries
 * and payment history. Returns `null` when not registered.
 */
export const getMyRegistration = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const reg = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId).eq("userId", user._id),
      )
      .unique();
    if (!reg) return null;

    const leaderEntries = await ctx.db
      .query("entries")
      .withIndex("by_leader", (q) => q.eq("leaderRegistrationId", reg._id))
      .collect();
    const followerEntries = await ctx.db
      .query("entries")
      .withIndex("by_follower", (q) =>
        q.eq("followerRegistrationId", reg._id),
      )
      .collect();
    const seen = new Set<Id<"entries">>();
    const entries = [...leaderEntries, ...followerEntries].filter((e) => {
      if (seen.has(e._id)) return false;
      seen.add(e._id);
      return true;
    });
    const enrichedEntries = await Promise.all(
      entries.map(async (entry) => {
        const event = await ctx.db.get(entry.eventId);
        const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
        const followerReg = await ctx.db.get(entry.followerRegistrationId);
        const leaderUser = leaderReg ? await ctx.db.get(leaderReg.userId) : null;
        const followerUser = followerReg
          ? await ctx.db.get(followerReg.userId)
          : null;
        return {
          _id: entry._id,
          eventId: entry.eventId,
          eventName: event?.name ?? null,
          eventStyle: event?.style ?? null,
          eventLevel: event?.level ?? null,
          eventPosition: event?.position ?? 0,
          scratched: entry.scratched,
          leaderRegistrationId: entry.leaderRegistrationId,
          followerRegistrationId: entry.followerRegistrationId,
          leaderDisplayName: leaderUser?.displayName ?? null,
          leaderUsername: leaderUser?.username ?? null,
          leaderAvatarUrl: leaderUser?.avatarUrl ?? null,
          followerDisplayName: followerUser?.displayName ?? null,
          followerUsername: followerUser?.username ?? null,
          followerAvatarUrl: followerUser?.avatarUrl ?? null,
        };
      }),
    );
    enrichedEntries.sort(
      (a, b) => (a.eventPosition ?? 0) - (b.eventPosition ?? 0),
    );

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
      .collect();
    payments.sort((a, b) => b.createdAt - a.createdAt);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...reg,
      entries: enrichedEntries,
      payments,
      totalPaid,
    };
  },
});

export const listByCompetition = query({
  args: {
    competitionId: v.id("competitions"),
    sortBy: v.optional(
      v.union(
        v.literal("org"),
        v.literal("name"),
        v.literal("paid"),
        v.literal("checked_in"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["registration"]);

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();

    const enriched = await Promise.all(
      regs.map(async (reg) => {
        const user = await ctx.db.get(reg.userId);
        const org = reg.orgId ? await ctx.db.get(reg.orgId) : null;
        const payments = await ctx.db
          .query("payments")
          .withIndex("by_registration", (q) =>
            q.eq("registrationId", reg._id),
          )
          .collect();
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        return {
          _id: reg._id,
          userId: reg.userId,
          competitorNumber: reg.competitorNumber ?? null,
          amountOwed: reg.amountOwed,
          paidConfirmed: reg.paidConfirmed,
          checkedIn: reg.checkedIn,
          orgId: reg.orgId ?? null,
          registeredAt: reg.registeredAt,
          cancelled: reg.cancelled,
          username: user?.username ?? null,
          displayName: user?.displayName ?? null,
          orgName: org?.name ?? null,
          totalPaid,
        };
      }),
    );

    const sortBy = args.sortBy ?? "org";
    enriched.sort((a, b) => {
      if (sortBy === "name") {
        return (a.displayName ?? "").localeCompare(b.displayName ?? "");
      }
      if (sortBy === "paid") {
        return (b.paidConfirmed ? 1 : 0) - (a.paidConfirmed ? 1 : 0);
      }
      if (sortBy === "checked_in") {
        return (a.checkedIn ? 0 : 1) - (b.checkedIn ? 0 : 1);
      }
      return (a.orgName ?? "").localeCompare(b.orgName ?? "");
    });
    return enriched;
  },
});

export const getById = query({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);

    const user = await ctx.db.get(reg.userId);

    const leaderEntries = await ctx.db
      .query("entries")
      .withIndex("by_leader", (q) => q.eq("leaderRegistrationId", reg._id))
      .collect();
    const followerEntries = await ctx.db
      .query("entries")
      .withIndex("by_follower", (q) =>
        q.eq("followerRegistrationId", reg._id),
      )
      .collect();
    const seen = new Set<Id<"entries">>();
    const entries = [...leaderEntries, ...followerEntries].filter((e) => {
      if (seen.has(e._id)) return false;
      seen.add(e._id);
      return true;
    });

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
      .collect();
    payments.sort((a, b) => b.createdAt - a.createdAt);
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    return {
      ...reg,
      user: user
        ? {
            _id: user._id,
            username: user.username ?? null,
            displayName: user.displayName ?? null,
            avatarUrl: user.avatarUrl ?? null,
          }
        : null,
      entries,
      payments,
      totalPaid,
    };
  },
});

/** Search the global user directory for partners, excluding self. */
export const searchPartners = query({
  args: {
    competitionId: v.id("competitions"),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const needle = args.query.trim().toLowerCase();
    if (needle.length === 0) return [];
    const usersList = await ctx.db.query("users").collect();
    const matches = usersList.filter(
      (u) =>
        u._id !== user._id &&
        ((u.username ?? "").toLowerCase().includes(needle) ||
          (u.displayName ?? "").toLowerCase().includes(needle)),
    );
    const limited = matches.slice(0, 20);
    return await Promise.all(
      limited.map(async (u) => {
        const reg = await ctx.db
          .query("competitionRegistrations")
          .withIndex("by_competition_user", (q) =>
            q.eq("competitionId", args.competitionId).eq("userId", u._id),
          )
          .unique();
        return {
          userId: u._id,
          username: u.username ?? null,
          displayName: u.displayName ?? null,
          avatarUrl: u.avatarUrl ?? null,
          registrationId: reg && !reg.cancelled ? reg._id : null,
        };
      }),
    );
  },
});

export const getPartnerEntries = query({
  args: {
    competitionId: v.id("competitions"),
    registrationId: v.id("competitionRegistrations"),
  },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg || reg.competitionId !== args.competitionId) {
      notFound("Registration not found");
    }
    const user = await ctx.db.get(reg.userId);

    const leaderEntries = await ctx.db
      .query("entries")
      .withIndex("by_leader", (q) =>
        q.eq("leaderRegistrationId", args.registrationId),
      )
      .collect();
    const followerEntries = await ctx.db
      .query("entries")
      .withIndex("by_follower", (q) =>
        q.eq("followerRegistrationId", args.registrationId),
      )
      .collect();
    const seen = new Set<Id<"entries">>();
    const all = [...leaderEntries, ...followerEntries].filter((e) => {
      if (seen.has(e._id)) return false;
      seen.add(e._id);
      return true;
    });
    const enriched = await Promise.all(
      all.map(async (entry) => {
        const event = await ctx.db.get(entry.eventId);
        const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
        const followerReg = await ctx.db.get(entry.followerRegistrationId);
        const leaderUser = leaderReg
          ? await ctx.db.get(leaderReg.userId)
          : null;
        const followerUser = followerReg
          ? await ctx.db.get(followerReg.userId)
          : null;
        return {
          _id: entry._id,
          eventId: entry.eventId,
          eventName: event?.name ?? null,
          eventStyle: event?.style ?? null,
          eventLevel: event?.level ?? null,
          eventPosition: event?.position ?? 0,
          scratched: entry.scratched,
          leaderRegistrationId: entry.leaderRegistrationId,
          followerRegistrationId: entry.followerRegistrationId,
          leaderDisplayName: leaderUser?.displayName ?? null,
          leaderUsername: leaderUser?.username ?? null,
          followerDisplayName: followerUser?.displayName ?? null,
          followerUsername: followerUser?.username ?? null,
        };
      }),
    );
    enriched.sort(
      (a, b) => (a.eventPosition ?? 0) - (b.eventPosition ?? 0),
    );
    return {
      registration: reg,
      user: user
        ? {
            _id: user._id,
            username: user.username ?? null,
            displayName: user.displayName ?? null,
            avatarUrl: user.avatarUrl ?? null,
          }
        : null,
      entries: enriched,
    };
  },
});

/** Pricing tiers available for a competition. Public read. */
export const listPricingTiers = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const tiers = await ctx.db
      .query("pricingTiers")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    tiers.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return tiers;
  },
});

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Register the current user for a competition. If `partnerUsername` is
 * provided, also create a registration for the partner (unless they already
 * have one). Throws if the competition is not accepting entries or the
 * caller already has a registration.
 */
export const register = mutation({
  args: {
    competitionId: v.id("competitions"),
    partnerUsername: v.optional(v.string()),
    orgId: v.optional(v.union(v.id("organizations"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) notFound("Competition not found");
    if (comp.status !== "accepting_entries") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Competition is not accepting entries",
      });
    }

    const existing = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId).eq("userId", user._id),
      )
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Already registered for this competition",
      });
    }

    const amountOwed = comp.baseFee ?? 0;
    const orgId = args.orgId ?? undefined;
    const now = Date.now();
    const selfId = await ctx.db.insert("competitionRegistrations", {
      competitionId: args.competitionId,
      userId: user._id,
      amountOwed,
      paidConfirmed: false,
      checkedIn: false,
      orgId,
      registeredAt: now,
      registeredBy: user._id,
      cancelled: false,
    });
    const self = await ctx.db.get(selfId);

    let partner: Doc<"competitionRegistrations"> | null = null;
    if (args.partnerUsername) {
      const partnerUser = await ctx.db
        .query("users")
        .withIndex("by_username", (q) =>
          q.eq("username", args.partnerUsername),
        )
        .unique();
      if (!partnerUser) {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Partner not found",
        });
      }
      const partnerExisting = await ctx.db
        .query("competitionRegistrations")
        .withIndex("by_competition_user", (q) =>
          q
            .eq("competitionId", args.competitionId)
            .eq("userId", partnerUser._id),
        )
        .unique();
      if (partnerExisting) {
        partner = partnerExisting;
      } else {
        const partnerId = await ctx.db.insert("competitionRegistrations", {
          competitionId: args.competitionId,
          userId: partnerUser._id,
          amountOwed,
          paidConfirmed: false,
          checkedIn: false,
          orgId,
          registeredAt: now,
          registeredBy: user._id,
          cancelled: false,
        });
        partner = await ctx.db.get(partnerId);
      }
    }

    return { self, partner };
  },
});

/**
 * Auto-create a registration for a partner so they can be paired into
 * entries by the caller. Returns the existing registration if one is
 * already present. Forbids self-registration via this path.
 */
export const ensurePartnerRegistered = mutation({
  args: {
    competitionId: v.id("competitions"),
    partnerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) notFound("Competition not found");
    if (comp.status !== "accepting_entries") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Competition is not accepting entries",
      });
    }
    if (args.partnerUserId === user._id) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Cannot register yourself as a partner",
      });
    }
    const partner = await ctx.db.get(args.partnerUserId);
    if (!partner) notFound("User not found");

    const existing = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q
          .eq("competitionId", args.competitionId)
          .eq("userId", args.partnerUserId),
      )
      .unique();
    if (existing) return existing;

    const id = await ctx.db.insert("competitionRegistrations", {
      competitionId: args.competitionId,
      userId: args.partnerUserId,
      amountOwed: comp.baseFee ?? 0,
      paidConfirmed: false,
      checkedIn: false,
      registeredAt: Date.now(),
      registeredBy: user._id,
      cancelled: false,
    });
    return await ctx.db.get(id);
  },
});

export const updateOrgAffiliation = mutation({
  args: {
    registrationId: v.id("competitionRegistrations"),
    orgId: v.union(v.id("organizations"), v.null()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    if (reg.userId !== user._id) {
      await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);
    }
    await ctx.db.patch(args.registrationId, {
      orgId: args.orgId ?? undefined,
    });
    return await ctx.db.get(args.registrationId);
  },
});

export const updatePricingTier = mutation({
  args: {
    registrationId: v.id("competitionRegistrations"),
    pricingTierId: v.union(v.id("pricingTiers"), v.null()),
  },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);

    const comp = await ctx.db.get(reg.competitionId);
    if (!comp) notFound("Competition not found");

    let tier: Doc<"pricingTiers"> | null = null;
    if (args.pricingTierId) {
      tier = await ctx.db.get(args.pricingTierId);
      if (!tier) notFound("Pricing tier not found");
    }

    const amountOwed = pickRegAmount(comp, tier);
    await ctx.db.patch(args.registrationId, {
      pricingTierId: tier ? tier._id : undefined,
      amountOwed,
    });
    return await ctx.db.get(args.registrationId);
  },
});

export const toggleCheckedIn = mutation({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);
    await ctx.db.patch(args.registrationId, { checkedIn: !reg.checkedIn });
    return await ctx.db.get(args.registrationId);
  },
});

export const cancel = mutation({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    if (reg.userId !== user._id) {
      await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);
    }
    await ctx.db.patch(args.registrationId, { cancelled: true });
    return await ctx.db.get(args.registrationId);
  },
});

// Pricing tier admin --------------------------------------------------

/** Create a pricing tier. Org admin/owner only. */
export const createPricingTier = mutation({
  args: {
    competitionId: v.id("competitions"),
    name: v.string(),
    price: v.number(),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const existing = await ctx.db
      .query("pricingTiers")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const maxPos = existing.reduce(
      (max, t) => Math.max(max, t.position ?? 0),
      0,
    );
    const id = await ctx.db.insert("pricingTiers", {
      competitionId: args.competitionId,
      name: args.name,
      price: args.price,
      position: maxPos + 1,
    });
    return await ctx.db.get(id);
  },
});

export const removePricingTier = mutation({
  args: { tierId: v.id("pricingTiers") },
  handler: async (ctx, args) => {
    const tier = await ctx.db.get(args.tierId);
    if (!tier) notFound("Pricing tier not found");
    await requireCompOrgRole(ctx, tier.competitionId);

    // Detach registrations on this tier
    const refs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", tier.competitionId),
      )
      .collect();
    for (const reg of refs) {
      if (reg.pricingTierId === args.tierId) {
        await ctx.db.patch(reg._id, { pricingTierId: undefined });
        await recalcAmountOwed(ctx, reg._id);
      }
    }
    await ctx.db.delete(args.tierId);
    return { success: true };
  },
});
