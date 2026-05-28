import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// Task 9 of the Convex migration: competition core workflows. These tests
// pin the behavior ported from the Drizzle/tRPC `competition`, `schedule`,
// `event`, `judge`, `staff`, `registration`, `entry`, `number`, `tba`,
// `teamMatch`, and `addDrop` routers. Live/scoring and payments stay on
// Task 10/11.

const ALICE = {
  tokenIdentifier: "https://clerk.example.com|user_alice",
  subject: "user_alice",
  name: "Alice Anderson",
};
const BOB = {
  tokenIdentifier: "https://clerk.example.com|user_bob",
  subject: "user_bob",
  name: "Bob Brown",
};
const CAROL = {
  tokenIdentifier: "https://clerk.example.com|user_carol",
  subject: "user_carol",
  name: "Carol Clark",
};

type T = TestConvex<typeof schema>;

async function seedUser(
  t: T,
  identity: { tokenIdentifier: string; subject: string },
  overrides: { username?: string; displayName?: string } = {},
): Promise<Id<"users">> {
  return t.run((ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      isPrivate: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    }),
  );
}

async function seedOrgWithOwner(
  t: T,
  ownerId: Id<"users">,
  overrides: { name?: string; slug?: string } = {},
): Promise<Id<"organizations">> {
  const now = Date.now();
  return t.run(async (ctx) => {
    const orgId = await ctx.db.insert("organizations", {
      slug: overrides.slug ?? "studio-one",
      name: overrides.name ?? "Studio One",
      membershipModel: "open",
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("memberships", {
      orgId,
      userId: ownerId,
      role: "admin",
      createdAt: now,
    });
    return orgId;
  });
}

async function seedCompetition(
  t: T,
  identity: { tokenIdentifier: string; subject: string },
  orgId: Id<"organizations">,
  name = "Spring Invitational",
): Promise<Id<"competitions">> {
  const comp = await t
    .withIdentity(identity)
    .mutation(api.competitions.core.create, { name, orgId });
  return comp._id;
}

// ── core ─────────────────────────────────────────────────────────────

describe("competition lifecycle", () => {
  it("create inserts a competition with auto-slug owned by the org admin", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);

    const comp = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.core.create, {
        name: "Spring Invitational",
        orgId,
      });

    expect(comp.slug).toBe("spring-invitational");
    expect(comp.status).toBe("draft");
    expect(comp.pricingModel).toBe("flat_fee");
    expect(comp.orgId).toBe(orgId);
  });

  it("create requires org admin/owner", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    await expect(
      t.withIdentity(BOB).mutation(api.competitions.core.create, {
        name: "Hostile Comp",
        orgId,
      }),
    ).rejects.toThrow();
  });

  it("getBySlug returns the comp with org metadata", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId, {
      name: "Studio Uno",
      slug: "studio-uno",
    });
    await seedCompetition(t, ALICE, orgId, "Big Comp");

    const result = await t.query(api.competitions.core.getBySlug, {
      slug: "big-comp",
    });
    expect(result?.orgName).toBe("Studio Uno");
    expect(result?.orgSlug).toBe("studio-uno");
  });

  it("list applies status filtering before pagination", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);

    for (let i = 0; i < 6; i += 1) {
      const compId = await seedCompetition(t, ALICE, orgId, `Comp ${i}`);
      if (i % 2 === 1) {
        await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
          competitionId: compId,
          status: "advertised",
        });
      }
    }

    const first = await t.query(api.competitions.core.list, {
      status: "draft",
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page.map((c) => c.name)).toEqual(["Comp 4", "Comp 2"]);
    expect(first.isDone).toBe(false);

    const second = await t.query(api.competitions.core.list, {
      status: "draft",
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(second.page.map((c) => c.name)).toEqual(["Comp 0"]);
    expect(second.isDone).toBe(true);
  });

  it("list applies org and status filtering before pagination", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgA = await seedOrgWithOwner(t, aliceId, { slug: "org-a" });
    const orgB = await seedOrgWithOwner(t, aliceId, { slug: "org-b" });

    for (let i = 0; i < 6; i += 1) {
      const compId = await seedCompetition(t, ALICE, orgA, `Org A Comp ${i}`);
      if (i % 2 === 1) {
        await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
          competitionId: compId,
          status: "advertised",
        });
      }
    }
    await seedCompetition(t, ALICE, orgB, "Org B Newest Draft");

    const result = await t.query(api.competitions.core.list, {
      orgId: orgA,
      status: "draft",
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(result.page.map((c) => c.name)).toEqual([
      "Org A Comp 4",
      "Org A Comp 2",
    ]);
    expect(result.page.every((c) => c.orgId === orgA && c.status === "draft"))
      .toBe(true);
  });

  it("update applies provided fields and ignores undefined ones", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    const updated = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.core.update, {
        competitionId: compId,
        venueName: "Grand Ballroom",
        baseFee: 2500,
      });
    expect(updated?.venueName).toBe("Grand Ballroom");
    expect(updated?.baseFee).toBe(2500);
    expect(updated?.name).toBe("Spring Invitational"); // unchanged
  });

  it("updateStatus advances lifecycle", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    const advertised = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.core.updateStatus, {
        competitionId: compId,
        status: "advertised",
      });
    expect(advertised?.status).toBe("advertised");
  });

  it("remove cascades schedule + events + staff + registrations", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    await t.withIdentity(ALICE).mutation(api.competitions.schedule.addDay, {
      competitionId: compId,
      date: "2026-09-01",
    });
    await t.withIdentity(ALICE).mutation(api.competitions.core.remove, {
      competitionId: compId,
    });
    expect(await t.run((ctx) => ctx.db.get(compId))).toBeNull();
    const days = await t.run((ctx) =>
      ctx.db
        .query("competitionDays")
        .withIndex("by_competition_position", (q) =>
          q.eq("competitionId", compId),
        )
        .collect(),
    );
    expect(days).toHaveLength(0);
  });

  it("setCompCode rejects duplicates", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compA = await seedCompetition(t, ALICE, orgId, "Comp A");
    const compB = await seedCompetition(t, ALICE, orgId, "Comp B");

    await t.withIdentity(ALICE).mutation(api.competitions.core.setCompCode, {
      competitionId: compA,
      compCode: "ABCD",
    });
    await expect(
      t.withIdentity(ALICE).mutation(api.competitions.core.setCompCode, {
        competitionId: compB,
        compCode: "ABCD",
      }),
    ).rejects.toThrow();
  });
});

// ── schedule ─────────────────────────────────────────────────────────

describe("schedule", () => {
  it("applyDefaultTemplate seeds 1 day + 6 sessions", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    const { day, blocks } = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.schedule.applyDefaultTemplate, {
        competitionId: compId,
        date: "2026-09-01",
      });
    expect(day?.date).toBe("2026-09-01");
    expect(blocks).toHaveLength(6);
    expect(blocks.map((b) => b.label)).toContain("Standard");
  });

  it("addBlock appends with max position + 1", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const day = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.schedule.addDay, {
        competitionId: compId,
        date: "2026-09-01",
      });

    const blockA = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.schedule.addBlock, {
        dayId: day!._id,
        type: "session",
        label: "Smooth",
      });
    const blockB = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.schedule.addBlock, {
        dayId: day!._id,
        type: "break",
        label: "Lunch",
      });
    expect(blockA?.position).toBe(1);
    expect(blockB?.position).toBe(2);
  });

  it("removeBlock unlinks events from the deleted session", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const day = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.schedule.addDay, {
        competitionId: compId,
        date: "2026-09-01",
      });
    const block = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.schedule.addBlock, {
        dayId: day!._id,
        type: "session",
        label: "Standard",
      });
    const event = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.events.create, {
        competitionId: compId,
        sessionId: block!._id,
        name: "Bronze Standard Waltz",
        style: "standard",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Waltz"],
      });
    await t.withIdentity(ALICE).mutation(api.competitions.schedule.removeBlock, {
      blockId: block!._id,
    });
    const refreshed = await t.run((ctx) => ctx.db.get(event._id));
    expect(refreshed?.sessionId).toBeUndefined();
  });
});

// ── events ────────────────────────────────────────────────────────────

describe("events", () => {
  it("generateDefaults creates events for the provided styles", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    const created = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.events.generateDefaults, {
        competitionId: compId,
        styles: ["standard"],
      });
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((e) => e.style === "standard")).toBe(true);
  });

  it("updateDances replaces the dance list atomically", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const event = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.events.create, {
        competitionId: compId,
        name: "Champ Latin 5-Dance",
        style: "latin",
        level: "champ",
        eventType: "multi_dance",
        dances: ["Cha Cha", "Samba"],
      });
    const updated = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.events.updateDances, {
        eventId: event._id,
        dances: ["Cha Cha", "Samba", "Rumba", "Paso Doble", "Jive"],
      });
    expect(updated.dances).toHaveLength(5);
    expect(updated.dances.map((d) => d.danceName)).toEqual([
      "Cha Cha",
      "Samba",
      "Rumba",
      "Paso Doble",
      "Jive",
    ]);
  });

  it("remove cascades event rounds, heats, marks, results, and entries", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const carolId = await seedUser(t, CAROL);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const event = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.events.create, {
        competitionId: compId,
        name: "Bronze Standard Waltz",
        style: "standard",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Waltz"],
      });

    const ids = await t.run(async (ctx) => {
      const leaderRegId = await ctx.db.insert("competitionRegistrations", {
        competitionId: compId,
        userId: bobId,
        amountOwed: 0,
        paidConfirmed: false,
        checkedIn: false,
        registeredAt: Date.now(),
        registeredBy: bobId,
        cancelled: false,
      });
      const followerRegId = await ctx.db.insert("competitionRegistrations", {
        competitionId: compId,
        userId: carolId,
        amountOwed: 0,
        paidConfirmed: false,
        checkedIn: false,
        registeredAt: Date.now(),
        registeredBy: carolId,
        cancelled: false,
      });
      const entryId = await ctx.db.insert("entries", {
        competitionId: compId,
        eventId: event._id,
        leaderRegistrationId: leaderRegId,
        followerRegistrationId: followerRegId,
        createdAt: Date.now(),
        createdBy: aliceId,
        scratched: false,
      });
      const judgeId = await ctx.db.insert("judges", {
        firstName: "Judy",
        lastName: "Judge",
        initials: "JJ",
        createdAt: Date.now(),
      });
      const roundId = await ctx.db.insert("rounds", {
        eventId: event._id,
        roundType: "final",
        position: 1,
        callbacksRequested: 6,
        status: "completed",
        heatsApproved: true,
      });
      const heatId = await ctx.db.insert("heats", {
        roundId,
        heatNumber: 1,
        status: "completed",
      });
      const heatAssignmentId = await ctx.db.insert("heatAssignments", {
        heatId,
        entryId,
      });
      const eventTimeOverrideId = await ctx.db.insert("eventTimeOverrides", {
        eventId: event._id,
        estimatedMinutes: 3,
      });
      const callbackMarkId = await ctx.db.insert("callbackMarks", {
        roundId,
        judgeId,
        entryId,
        marked: true,
      });
      const finalMarkId = await ctx.db.insert("finalMarks", {
        roundId,
        judgeId,
        entryId,
        danceName: "Waltz",
        placement: 1,
      });
      const judgeSubmissionId = await ctx.db.insert("judgeSubmissions", {
        roundId,
        judgeId,
        status: "confirmed",
      });
      const callbackResultId = await ctx.db.insert("callbackResults", {
        roundId,
        entryId,
        totalMarks: 1,
        advanced: true,
      });
      const finalResultId = await ctx.db.insert("finalResults", {
        roundId,
        entryId,
        placement: 1,
      });
      const tabulationTableId = await ctx.db.insert("tabulationTables", {
        roundId,
        entryId,
        tableData: { rows: [] },
      });
      const roundResultsMetaId = await ctx.db.insert("roundResultsMeta", {
        roundId,
        status: "computed",
      });
      const activeRoundId = await ctx.db.insert("activeRounds", {
        competitionId: compId,
        roundId,
        startedAt: Date.now(),
      });
      const markCorrectionId = await ctx.db.insert("markCorrections", {
        roundId,
        judgeId,
        entryId,
        oldValue: "2",
        newValue: "1",
        source: "scrutineer",
        createdAt: Date.now(),
      });
      const deckCheckinId = await ctx.db.insert("deckCaptainCheckins", {
        roundId,
        entryId,
        status: "present",
        checkedInBy: aliceId,
        updatedAt: Date.now(),
      });
      return {
        eventId: event._id,
        entryId,
        roundId,
        heatId,
        heatAssignmentId,
        eventTimeOverrideId,
        callbackMarkId,
        finalMarkId,
        judgeSubmissionId,
        callbackResultId,
        finalResultId,
        tabulationTableId,
        roundResultsMetaId,
        activeRoundId,
        markCorrectionId,
        deckCheckinId,
      };
    });

    await t.withIdentity(ALICE).mutation(api.competitions.events.remove, {
      eventId: event._id,
    });

    await t.run(async (ctx) => {
      await expect(ctx.db.get(ids.eventId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.entryId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.roundId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.heatId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.heatAssignmentId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.eventTimeOverrideId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.callbackMarkId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.finalMarkId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.judgeSubmissionId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.callbackResultId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.finalResultId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.tabulationTableId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.roundResultsMetaId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.activeRoundId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.markCorrectionId)).resolves.toBeNull();
      await expect(ctx.db.get(ids.deckCheckinId)).resolves.toBeNull();
    });
  });
});

// ── judges + staff ───────────────────────────────────────────────────

describe("judges and staff", () => {
  it("assignToCompetition links a judge and rejects duplicates", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    const judge = await t.withIdentity(ALICE).mutation(
      api.competitions.judges.create,
      { firstName: "Jamie", lastName: "Lee" },
    );
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.judges.assignToCompetition, {
        competitionId: compId,
        judgeId: judge!._id,
      });
    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.competitions.judges.assignToCompetition, {
          competitionId: compId,
          judgeId: judge!._id,
        }),
    ).rejects.toThrow();
  });

  it("staff assign + remove round-trips", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    await t.withIdentity(ALICE).mutation(api.competitions.staff.assign, {
      competitionId: compId,
      userId: bobId,
      role: "emcee",
    });
    const list = await t
      .withIdentity(ALICE)
      .query(api.competitions.staff.listByCompetition, {
        competitionId: compId,
      });
    expect(list.some((s) => s.userId === bobId && s.role === "emcee")).toBe(
      true,
    );

    await t.withIdentity(ALICE).mutation(api.competitions.staff.remove, {
      competitionId: compId,
      userId: bobId,
      role: "emcee",
    });
    const after = await t
      .withIdentity(ALICE)
      .query(api.competitions.staff.listByCompetition, {
        competitionId: compId,
      });
    expect(after.some((s) => s.userId === bobId && s.role === "emcee")).toBe(
      false,
    );
  });
});

// ── registration + entries ───────────────────────────────────────────

describe("registration + entries", () => {
  async function setupAcceptingComp(t: T) {
    const aliceId = await seedUser(t, ALICE, { username: "alice" });
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const carolId = await seedUser(t, CAROL, { username: "carol" });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await t.withIdentity(ALICE).mutation(api.competitions.core.update, {
      competitionId: compId,
      baseFee: 2500,
    });
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "accepting_entries",
    });
    return { aliceId, bobId, carolId, orgId, compId };
  }

  it("register creates self + partner registrations idempotently", async () => {
    const t = convexTest(schema, modules);
    const { compId } = await setupAcceptingComp(t);

    const { self, partner } = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.register, {
        competitionId: compId,
        partnerUsername: "carol",
      });
    expect(self?.amountOwed).toBe(2500);
    expect(partner?.amountOwed).toBe(2500);

    // Re-running rejects "already registered"
    await expect(
      t
        .withIdentity(BOB)
        .mutation(api.competitions.registration.register, {
          competitionId: compId,
        }),
    ).rejects.toThrow();
  });

  it("register rejects when status is not accepting_entries", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await seedUser(t, BOB);
    await expect(
      t.withIdentity(BOB).mutation(api.competitions.registration.register, {
        competitionId: compId,
      }),
    ).rejects.toThrow();
  });

  it("ensurePartnerRegistered is idempotent", async () => {
    const t = convexTest(schema, modules);
    const { compId, carolId } = await setupAcceptingComp(t);

    const first = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.ensurePartnerRegistered, {
        competitionId: compId,
        partnerUserId: carolId,
      });
    const second = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.ensurePartnerRegistered, {
        competitionId: compId,
        partnerUserId: carolId,
      });
    expect(first?._id).toBe(second?._id);
  });

  it("bulkCreate inserts entries and re-runs are no-ops", async () => {
    const t = convexTest(schema, modules);
    const { compId } = await setupAcceptingComp(t);

    const event = await t.withIdentity(ALICE).mutation(
      api.competitions.events.create,
      {
        competitionId: compId,
        name: "Bronze Standard Waltz",
        style: "standard",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Waltz"],
      },
    );
    const { self: bobReg, partner: carolReg } = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.register, {
        competitionId: compId,
        partnerUsername: "carol",
      });
    expect(carolReg).not.toBeNull();

    const created = await t
      .withIdentity(BOB)
      .mutation(api.competitions.entries.bulkCreate, {
        entries: [
          {
            eventId: event._id,
            leaderRegistrationId: bobReg!._id,
            followerRegistrationId: carolReg!._id,
          },
        ],
      });
    expect(created).toHaveLength(1);
    expect(created[0]?.competitionId).toBe(compId);

    const repeat = await t
      .withIdentity(BOB)
      .mutation(api.competitions.entries.bulkCreate, {
        entries: [
          {
            eventId: event._id,
            leaderRegistrationId: bobReg!._id,
            followerRegistrationId: carolReg!._id,
          },
        ],
      });
    expect(repeat[0]?._id).toBe(created[0]?._id);
  });

  it("bulkCreate rejects a later event from another competition", async () => {
    const t = convexTest(schema, modules);
    const { compId, orgId } = await setupAcceptingComp(t);
    const comp2Id = await seedCompetition(t, ALICE, orgId, "Other Comp");
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: comp2Id,
      status: "accepting_entries",
    });

    const eventA = await t.withIdentity(ALICE).mutation(
      api.competitions.events.create,
      {
        competitionId: compId,
        name: "Bronze Standard Waltz",
        style: "standard",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Waltz"],
      },
    );
    const eventB = await t.withIdentity(ALICE).mutation(
      api.competitions.events.create,
      {
        competitionId: comp2Id,
        name: "Bronze Latin Cha Cha",
        style: "latin",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Cha Cha"],
      },
    );
    const { self: bobReg, partner: carolReg } = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.register, {
        competitionId: compId,
        partnerUsername: "carol",
      });

    await expect(
      t.withIdentity(BOB).mutation(api.competitions.entries.bulkCreate, {
        entries: [
          {
            eventId: eventA._id,
            leaderRegistrationId: bobReg!._id,
            followerRegistrationId: carolReg!._id,
          },
          {
            eventId: eventB._id,
            leaderRegistrationId: bobReg!._id,
            followerRegistrationId: carolReg!._id,
          },
        ],
      }),
    ).rejects.toThrow();

    const created = await t.run((ctx) =>
      ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", eventA._id))
        .collect(),
    );
    expect(created).toHaveLength(0);
  });

  it("stats aggregates competition-scoped entries and payments", async () => {
    const t = convexTest(schema, modules);
    const { compId } = await setupAcceptingComp(t);

    const eventA = await t.withIdentity(ALICE).mutation(
      api.competitions.events.create,
      {
        competitionId: compId,
        name: "Bronze Standard Waltz",
        style: "standard",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Waltz"],
      },
    );
    await t.withIdentity(ALICE).mutation(api.competitions.events.create, {
      competitionId: compId,
      name: "Bronze Latin Cha Cha",
      style: "latin",
      level: "bronze",
      eventType: "single_dance",
      dances: ["Cha Cha"],
    });
    const { self: bobReg, partner: carolReg } = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.register, {
        competitionId: compId,
        partnerUsername: "carol",
      });

    await t.withIdentity(BOB).mutation(api.competitions.entries.bulkCreate, {
      entries: [
        {
          eventId: eventA._id,
          leaderRegistrationId: bobReg!._id,
          followerRegistrationId: carolReg!._id,
        },
      ],
    });
    const payment = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.payments.recordManual, {
        registrationId: bobReg!._id,
        amount: "10.00",
        method: "cash",
      });
    expect(payment.competitionId).toBe(compId);

    const stats = await t
      .withIdentity(ALICE)
      .query(api.competitions.stats.getCompetitionStats, {
        competitionId: compId,
      });
    expect(stats.totalRegistrations).toBe(2);
    expect(stats.totalEntries).toBe(1);
    expect(stats.totalEvents).toBe(2);
    expect(stats.totalCollected).toBe("10.00");
    expect(stats.totalOwed).toBe("50.00");
    expect(stats.entriesPerEvent).toEqual([
      expect.objectContaining({ eventName: "Bronze Latin Cha Cha", entryCount: 0 }),
      expect.objectContaining({ eventName: "Bronze Standard Waltz", entryCount: 1 }),
    ]);
  });

  it("entries.remove + per-event pricing recalculates amountOwed", async () => {
    const t = convexTest(schema, modules);
    const { compId } = await setupAcceptingComp(t);
    await t.withIdentity(ALICE).mutation(api.competitions.core.update, {
      competitionId: compId,
      pricingModel: "per_event",
      baseFee: 1000,
    });
    const event = await t.withIdentity(ALICE).mutation(
      api.competitions.events.create,
      {
        competitionId: compId,
        name: "Bronze Standard Waltz",
        style: "standard",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Waltz"],
      },
    );
    await t.withIdentity(ALICE).mutation(api.competitions.events.update, {
      eventId: event._id,
      entryPrice: 500,
    });
    const { self: bobReg, partner: carolReg } = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.register, {
        competitionId: compId,
        partnerUsername: "carol",
      });
    const created = await t
      .withIdentity(BOB)
      .mutation(api.competitions.entries.bulkCreate, {
        entries: [
          {
            eventId: event._id,
            leaderRegistrationId: bobReg!._id,
            followerRegistrationId: carolReg!._id,
          },
        ],
      });
    expect(created).toHaveLength(1);
    const bobAfterAdd = await t.run((ctx) => ctx.db.get(bobReg!._id));
    expect(bobAfterAdd?.amountOwed).toBe(1500);

    await t.withIdentity(BOB).mutation(api.competitions.entries.remove, {
      entryId: created[0]!._id,
    });
    const bobAfterRemove = await t.run((ctx) => ctx.db.get(bobReg!._id));
    expect(bobAfterRemove?.amountOwed).toBe(1000);
  });
});

// ── numbers ──────────────────────────────────────────────────────────

describe("numbers", () => {
  it("autoAssign uses numberStart and skips exclusions", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const carolId = await seedUser(t, CAROL, { username: "carol" });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await t.withIdentity(ALICE).mutation(api.competitions.core.update, {
      competitionId: compId,
      numberStart: 100,
      numberExclusions: [101],
    });
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "accepting_entries",
    });
    const event = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.events.create, {
        competitionId: compId,
        name: "Bronze Standard Waltz",
        style: "standard",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Waltz"],
      });
    const { self: bobReg, partner: carolReg } = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.register, {
        competitionId: compId,
        partnerUsername: "carol",
      });
    await t.withIdentity(BOB).mutation(api.competitions.entries.bulkCreate, {
      entries: [
        {
          eventId: event._id,
          leaderRegistrationId: bobReg!._id,
          followerRegistrationId: carolReg!._id,
        },
      ],
    });

    const result = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.numbers.autoAssign, {
        competitionId: compId,
      });
    expect(result.assigned).toBe(1);
    const bobNum = (await t.run((ctx) => ctx.db.get(bobReg!._id)))
      ?.competitorNumber;
    expect(bobNum).toBe(100); // 101 was excluded → first available is 100
    void carolId;
  });

  it("manualAssign rejects duplicates", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, BOB, { username: "bob" });
    await seedUser(t, CAROL, { username: "carol" });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "accepting_entries",
    });
    const { self, partner } = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.register, {
        competitionId: compId,
        partnerUsername: "carol",
      });
    await t.withIdentity(ALICE).mutation(api.competitions.numbers.manualAssign, {
      registrationId: self!._id,
      number: 42,
    });
    await expect(
      t.withIdentity(ALICE).mutation(api.competitions.numbers.manualAssign, {
        registrationId: partner!._id,
        number: 42,
      }),
    ).rejects.toThrow();
  });
});

// ── tba ──────────────────────────────────────────────────────────────

describe("tba", () => {
  it("create + listByCompetition shows the listing", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, BOB, { username: "bob" });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    await t.withIdentity(BOB).mutation(api.competitions.tba.create, {
      competitionId: compId,
      style: "standard",
      level: "bronze",
      role: "follower",
      notes: "available all weekend",
    });
    const listings = await t.query(
      api.competitions.tba.listByCompetition,
      { competitionId: compId },
    );
    expect(listings).toHaveLength(1);
    expect(listings[0]?.role).toBe("follower");
  });

  it("markFulfilled forbids non-owners", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    const listing = await t.withIdentity(BOB).mutation(
      api.competitions.tba.create,
      {
        competitionId: compId,
        style: "standard",
        level: "bronze",
        role: "follower",
      },
    );
    await expect(
      t.withIdentity(ALICE).mutation(api.competitions.tba.markFulfilled, {
        listingId: listing!._id,
      }),
    ).rejects.toThrow();
  });
});

// ── team-match ───────────────────────────────────────────────────────

describe("team match", () => {
  it("submit + remove round-trip with author ownership", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    // Bob is staff so he can read
    await t.withIdentity(ALICE).mutation(api.competitions.staff.assign, {
      competitionId: compId,
      userId: aliceId,
      role: "scrutineer",
    });

    const submission = await t.withIdentity(BOB).mutation(
      api.competitions.teamMatch.submit,
      {
        competitionId: compId,
        content: "Team Studio Uno lineup",
      },
    );
    const list = await t.withIdentity(ALICE).query(
      api.competitions.teamMatch.listByCompetition,
      { competitionId: compId },
    );
    expect(list).toHaveLength(1);

    await t
      .withIdentity(BOB)
      .mutation(api.competitions.teamMatch.remove, {
        submissionId: submission!._id,
      });
    const after = await t.withIdentity(ALICE).query(
      api.competitions.teamMatch.listByCompetition,
      { competitionId: compId },
    );
    expect(after).toHaveLength(0);
  });
});

// ── add/drop ─────────────────────────────────────────────────────────

describe("add/drop", () => {
  async function setupClosedCompWithEntry(t: T) {
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB, { username: "bob" });
    const carolId = await seedUser(t, CAROL, { username: "carol" });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "accepting_entries",
    });
    const eventA = await t.withIdentity(ALICE).mutation(
      api.competitions.events.create,
      {
        competitionId: compId,
        name: "Bronze Standard Waltz",
        style: "standard",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Waltz"],
      },
    );
    const eventB = await t.withIdentity(ALICE).mutation(
      api.competitions.events.create,
      {
        competitionId: compId,
        name: "Silver Standard Waltz",
        style: "standard",
        level: "silver",
        eventType: "single_dance",
        dances: ["Waltz"],
      },
    );
    const { self: bobReg, partner: carolReg } = await t
      .withIdentity(BOB)
      .mutation(api.competitions.registration.register, {
        competitionId: compId,
        partnerUsername: "carol",
      });
    await t.withIdentity(BOB).mutation(api.competitions.entries.bulkCreate, {
      entries: [
        {
          eventId: eventA._id,
          leaderRegistrationId: bobReg!._id,
          followerRegistrationId: carolReg!._id,
        },
      ],
    });
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "entries_closed",
    });
    return { aliceId, bobId, carolId, compId, eventA, eventB, bobReg, carolReg };
  }

  it("submit rejects when status is not entries_closed", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, BOB, { username: "bob" });
    await seedUser(t, CAROL, { username: "carol" });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "accepting_entries",
    });
    const event = await t.withIdentity(ALICE).mutation(
      api.competitions.events.create,
      {
        competitionId: compId,
        name: "Bronze Standard Waltz",
        style: "standard",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Waltz"],
      },
    );
    const { self, partner } = await t.withIdentity(BOB).mutation(
      api.competitions.registration.register,
      { competitionId: compId, partnerUsername: "carol" },
    );
    await expect(
      t.withIdentity(BOB).mutation(api.competitions.addDrop.submit, {
        competitionId: compId,
        type: "add",
        eventId: event._id,
        leaderRegistrationId: self!._id,
        followerRegistrationId: partner!._id,
      }),
    ).rejects.toThrow();
  });

  it("approve drop removes the entry; approve add inserts it", async () => {
    const t = convexTest(schema, modules);
    const ctx = await setupClosedCompWithEntry(t);
    const { compId, eventA, eventB, bobReg, carolReg } = ctx;

    const drop = await t.withIdentity(BOB).mutation(
      api.competitions.addDrop.submit,
      {
        competitionId: compId,
        type: "drop",
        eventId: eventA._id,
        leaderRegistrationId: bobReg!._id,
        followerRegistrationId: carolReg!._id,
      },
    );
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.addDrop.approve, { requestId: drop!._id });
    const remaining = await t.run((ctx2) =>
      ctx2.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", eventA._id))
        .collect(),
    );
    expect(remaining).toHaveLength(0);

    const add = await t.withIdentity(BOB).mutation(
      api.competitions.addDrop.submit,
      {
        competitionId: compId,
        type: "add",
        eventId: eventB._id,
        leaderRegistrationId: bobReg!._id,
        followerRegistrationId: carolReg!._id,
      },
    );
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.addDrop.approve, { requestId: add!._id });
    const inserted = await t.run((ctx2) =>
      ctx2.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", eventB._id))
        .collect(),
    );
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.competitionId).toBe(compId);
  });

  it("submit rejects an event from another competition", async () => {
    const t = convexTest(schema, modules);
    const ctx = await setupClosedCompWithEntry(t);
    const { compId, orgId } = await t.run(async (dbCtx) => {
      const comp = await dbCtx.db.get(ctx.compId);
      return { compId: ctx.compId, orgId: comp!.orgId };
    });
    const otherCompId = await seedCompetition(t, ALICE, orgId, "Other Comp");
    const otherEvent = await t.withIdentity(ALICE).mutation(
      api.competitions.events.create,
      {
        competitionId: otherCompId,
        name: "Bronze Latin Cha Cha",
        style: "latin",
        level: "bronze",
        eventType: "single_dance",
        dances: ["Cha Cha"],
      },
    );

    await expect(
      t.withIdentity(BOB).mutation(api.competitions.addDrop.submit, {
        competitionId: compId,
        type: "add",
        eventId: otherEvent._id,
        leaderRegistrationId: ctx.bobReg!._id,
        followerRegistrationId: ctx.carolReg!._id,
      }),
    ).rejects.toThrow();
  });

  it("reject stores reviewer notes separately from submitter reason", async () => {
    const t = convexTest(schema, modules);
    const { compId, eventB, bobReg, carolReg } = await setupClosedCompWithEntry(t);

    const request = await t.withIdentity(BOB).mutation(
      api.competitions.addDrop.submit,
      {
        competitionId: compId,
        type: "add",
        eventId: eventB._id,
        leaderRegistrationId: bobReg!._id,
        followerRegistrationId: carolReg!._id,
        reason: "submitter wants more dancing",
      },
    );
    const rejected = await t.withIdentity(ALICE).mutation(
      api.competitions.addDrop.reject,
      { requestId: request!._id, reason: "reviewer says no" },
    );

    expect(rejected?.status).toBe("rejected");
    expect(rejected?.reason).toBe("submitter wants more dancing");
    expect(rejected?.reviewNotes).toBe("reviewer says no");
  });

  it("approveAllSafe only resolves non-rounds-affecting requests", async () => {
    const t = convexTest(schema, modules);
    const ctx = await setupClosedCompWithEntry(t);
    const { compId, eventA, bobReg, carolReg } = ctx;

    const drop = await t.withIdentity(BOB).mutation(
      api.competitions.addDrop.submit,
      {
        competitionId: compId,
        type: "drop",
        eventId: eventA._id,
        leaderRegistrationId: bobReg!._id,
        followerRegistrationId: carolReg!._id,
      },
    );
    const result = await t.withIdentity(ALICE).mutation(
      api.competitions.addDrop.approveAllSafe,
      { competitionId: compId },
    );
    expect(result.approved).toBe(1);
    const refreshed = await t.run((c) => c.db.get(drop!._id));
    expect(refreshed?.status).toBe("approved");
  });
});
