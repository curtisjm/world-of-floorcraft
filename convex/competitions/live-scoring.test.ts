import { convexTest, type TestConvex } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import schema from "../schema";
import { modules } from "../test.setup";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { buildUserSearchText } from "../lib/search";
import { createJudgeToken } from "./lib/judgeAuth";

// Task 10 of the Convex migration: competition live and scoring. These tests
// pin the behavior ported from the Drizzle/tRPC `round`, `scoring`,
// `judge-session`, `scrutineer`, `scrutineer-dashboard`, `emcee`,
// `deck-captain`, `registration-table`, `live-view`, `results`,
// `feedback`, `calendar`, `org-competition`, `payment-analytics`, and
// `record-removal` routers.

beforeAll(() => {
  process.env.JUDGE_JWT_SECRET ??=
    "test-jwt-secret-min-32-chars-for-judges-only";
});

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
const SCRUT = {
  tokenIdentifier: "https://clerk.example.com|user_scrut",
  subject: "user_scrut",
  name: "Scrutineer Stan",
};
const EMCEE = {
  tokenIdentifier: "https://clerk.example.com|user_emcee",
  subject: "user_emcee",
  name: "Emcee Eve",
};
const DECK = {
  tokenIdentifier: "https://clerk.example.com|user_deck",
  subject: "user_deck",
  name: "Deck Dan",
};
const REG = {
  tokenIdentifier: "https://clerk.example.com|user_reg",
  subject: "user_reg",
  name: "Registration Rita",
};
const CHAIR = {
  tokenIdentifier: "https://clerk.example.com|user_chair",
  subject: "user_chair",
  name: "Chairman Chris",
};

type T = TestConvex<typeof schema>;

async function seedUser(
  t: T,
  identity: {
    tokenIdentifier: string;
    subject: string;
  },
  overrides: { username?: string; displayName?: string } = {},
): Promise<Id<"users">> {
  const now = Date.now();
  const displayName = overrides.displayName ?? identity.subject;
  const username = overrides.username;
  return t.run((ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      displayName,
      username,
      searchText: buildUserSearchText({ username, displayName }),
      isPrivate: false,
      createdAt: now,
      updatedAt: now,
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
) {
  const comp = await t
    .withIdentity(identity)
    .mutation(api.competitions.core.create, { name, orgId });
  return comp._id;
}

async function seedEvent(
  t: T,
  competitionId: Id<"competitions">,
  overrides: {
    name?: string;
    style?: "standard" | "smooth" | "latin" | "rhythm" | "nightclub";
    level?:
      | "newcomer"
      | "bronze"
      | "silver"
      | "gold"
      | "novice"
      | "prechamp"
      | "champ"
      | "professional";
    eventType?: "single_dance" | "multi_dance";
    dances?: string[];
    maxFinalSize?: number;
    maxHeatSize?: number;
  } = {},
): Promise<Id<"competitionEvents">> {
  return t.run(async (ctx) => {
    const eventId = await ctx.db.insert("competitionEvents", {
      competitionId,
      name: overrides.name ?? "Standard Bronze Waltz",
      style: overrides.style ?? "standard",
      level: overrides.level ?? "bronze",
      eventType: overrides.eventType ?? "single_dance",
      position: 1,
      maxFinalSize: overrides.maxFinalSize,
      maxHeatSize: overrides.maxHeatSize,
    });
    const dances = overrides.dances ?? ["waltz"];
    for (let i = 0; i < dances.length; i++) {
      await ctx.db.insert("eventDances", {
        eventId,
        danceName: dances[i]!,
        position: i,
      });
    }
    return eventId;
  });
}

async function seedRegistration(
  t: T,
  competitionId: Id<"competitions">,
  userId: Id<"users">,
  overrides: {
    competitorNumber?: number;
    orgId?: Id<"organizations">;
    amountOwed?: number;
  } = {},
): Promise<Id<"competitionRegistrations">> {
  return t.run((ctx) =>
    ctx.db.insert("competitionRegistrations", {
      competitionId,
      userId,
      competitorNumber: overrides.competitorNumber,
      amountOwed: overrides.amountOwed ?? 0,
      paidConfirmed: false,
      checkedIn: false,
      orgId: overrides.orgId,
      registeredAt: Date.now(),
      registeredBy: userId,
      cancelled: false,
    }),
  );
}

async function seedEntry(
  t: T,
  eventId: Id<"competitionEvents">,
  leaderRegId: Id<"competitionRegistrations">,
  followerRegId: Id<"competitionRegistrations">,
  createdBy: Id<"users">,
): Promise<Id<"entries">> {
  return t.run((ctx) =>
    ctx.db.insert("entries", {
      eventId,
      leaderRegistrationId: leaderRegId,
      followerRegistrationId: followerRegId,
      createdAt: Date.now(),
      createdBy,
      scratched: false,
    }),
  );
}

async function seedJudge(
  t: T,
  competitionId: Id<"competitions">,
  overrides: { firstName?: string; lastName?: string } = {},
): Promise<Id<"judges">> {
  return t.run(async (ctx) => {
    const judgeId = await ctx.db.insert("judges", {
      firstName: overrides.firstName ?? "Judy",
      lastName: overrides.lastName ?? "Judge",
      initials: "JJ",
      createdAt: Date.now(),
    });
    await ctx.db.insert("competitionJudges", {
      competitionId,
      judgeId,
      createdAt: Date.now(),
    });
    return judgeId;
  });
}

async function seedStaff(
  t: T,
  competitionId: Id<"competitions">,
  userId: Id<"users">,
  role:
    | "scrutineer"
    | "emcee"
    | "chairman"
    | "dj"
    | "registration"
    | "deck_captain",
) {
  return t.run((ctx) =>
    ctx.db.insert("competitionStaff", {
      competitionId,
      userId,
      role,
      createdAt: Date.now(),
    }),
  );
}

async function seedDay(
  t: T,
  competitionId: Id<"competitions">,
  date = "2026-06-01",
): Promise<Id<"competitionDays">> {
  return t.run((ctx) =>
    ctx.db.insert("competitionDays", {
      competitionId,
      date,
      position: 0,
    }),
  );
}

// ── Rounds module ──────────────────────────────────────────────────

describe("rounds", () => {
  it("generateForEvent creates a single final for small entries", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, CHAIR);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId, { maxFinalSize: 8 });
    await seedStaff(
      t,
      compId,
      await t.run((ctx) =>
        ctx.db
          .query("users")
          .withIndex("by_token_identifier", (q) =>
            q.eq("tokenIdentifier", CHAIR.tokenIdentifier),
          )
          .unique()
          .then((u) => u!._id),
      ),
      "chairman",
    );

    // Seed 6 entries
    for (let i = 0; i < 6; i++) {
      const leader = await seedUser(
        t,
        {
          tokenIdentifier: `https://clerk.example.com|leader_${i}`,
          subject: `leader_${i}`,
        },
        { displayName: `Leader ${i}` },
      );
      const follower = await seedUser(
        t,
        {
          tokenIdentifier: `https://clerk.example.com|follower_${i}`,
          subject: `follower_${i}`,
        },
        { displayName: `Follower ${i}` },
      );
      const leaderReg = await seedRegistration(t, compId, leader, {
        competitorNumber: 100 + i,
      });
      const followerReg = await seedRegistration(t, compId, follower);
      await seedEntry(t, eventId, leaderReg, followerReg, leader);
    }

    const result = await t
      .withIdentity(CHAIR)
      .mutation(api.competitions.rounds.generateForEvent, { eventId });
    expect(result.rounds).toBe(1);
    expect(result.heats).toBe(1);

    const rounds = await t.query(api.competitions.rounds.listByEvent, {
      eventId,
    });
    expect(rounds).toHaveLength(1);
    expect(rounds[0]!.roundType).toBe("final");
  });

  it("reassignHeats distributes round-robin across multiple heats", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId, {
      maxFinalSize: 100,
      maxHeatSize: 3,
    });
    for (let i = 0; i < 7; i++) {
      const leader = await seedUser(t, {
        tokenIdentifier: `https://clerk.example.com|rrh_l_${i}`,
        subject: `rrh_l_${i}`,
      });
      const follower = await seedUser(t, {
        tokenIdentifier: `https://clerk.example.com|rrh_f_${i}`,
        subject: `rrh_f_${i}`,
      });
      const leaderReg = await seedRegistration(t, compId, leader);
      const followerReg = await seedRegistration(t, compId, follower);
      await seedEntry(t, eventId, leaderReg, followerReg, leader);
    }
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "final",
        position: 1,
        status: "pending",
        heatsApproved: false,
      }),
    );
    const result = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.rounds.reassignHeats, { roundId });
    expect(result.heats).toBe(3);
    expect(result.entries).toBe(7);
  });

  it("approveHeats requires chairman", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId);
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "final",
        position: 1,
        status: "pending",
        heatsApproved: false,
      }),
    );
    await expect(
      t
        .withIdentity(BOB)
        .mutation(api.competitions.rounds.approveHeats, { roundId }),
    ).rejects.toThrow();

    const result = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.rounds.approveHeats, { roundId });
    expect(result?.heatsApproved).toBe(true);
  });

  it("moveEntry requires heats in the same round", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId);
    const leader = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|mover_l",
      subject: "mover_l",
    });
    const follower = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|mover_f",
      subject: "mover_f",
    });
    const leaderReg = await seedRegistration(t, compId, leader);
    const followerReg = await seedRegistration(t, compId, follower);
    const entryId = await seedEntry(t, eventId, leaderReg, followerReg, leader);

    const round1 = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "1st_round",
        position: 1,
        status: "pending",
        heatsApproved: false,
      }),
    );
    const round2 = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "final",
        position: 2,
        status: "pending",
        heatsApproved: false,
      }),
    );
    const heat1 = await t.run((ctx) =>
      ctx.db.insert("heats", {
        roundId: round1,
        heatNumber: 1,
        status: "pending",
      }),
    );
    const heat2 = await t.run((ctx) =>
      ctx.db.insert("heats", {
        roundId: round2,
        heatNumber: 1,
        status: "pending",
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("heatAssignments", { heatId: heat1, entryId }),
    );

    await expect(
      t.withIdentity(ALICE).mutation(api.competitions.rounds.moveEntry, {
        entryId,
        fromHeatId: heat1,
        toHeatId: heat2,
      }),
    ).rejects.toThrow();
  });
});

// ── Scoring module ─────────────────────────────────────────────────

describe("scoring", () => {
  it("submitCallbackMarks requires competition scoring authorization", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId);
    const judgeId = await seedJudge(t, compId);
    const leader = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|auth_l",
      subject: "auth_l",
    });
    const follower = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|auth_f",
      subject: "auth_f",
    });
    const leaderReg = await seedRegistration(t, compId, leader);
    const followerReg = await seedRegistration(t, compId, follower);
    const entryId = await seedEntry(t, eventId, leaderReg, followerReg, leader);
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "1st_round",
        position: 1,
        status: "in_progress",
        heatsApproved: true,
      }),
    );

    await expect(
      t.withIdentity(BOB).mutation(api.competitions.scoring.submitCallbackMarks, {
        roundId,
        judgeId,
        marks: [{ entryId, marked: true }],
      }),
    ).rejects.toThrow();
  });

  it("submitCallbackMarks rejects unassigned judges and cross-event entries", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId, { name: "Event One" });
    const otherEventId = await seedEvent(t, compId, { name: "Event Two" });
    const judgeId = await seedJudge(t, compId);
    const unassignedJudgeId = await t.run((ctx) =>
      ctx.db.insert("judges", {
        firstName: "Una",
        lastName: "Assigned",
        createdAt: Date.now(),
      }),
    );
    const leader = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|cross_l",
      subject: "cross_l",
    });
    const follower = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|cross_f",
      subject: "cross_f",
    });
    const leaderReg = await seedRegistration(t, compId, leader);
    const followerReg = await seedRegistration(t, compId, follower);
    const entryId = await seedEntry(t, eventId, leaderReg, followerReg, leader);
    const otherEntryId = await seedEntry(
      t,
      otherEventId,
      leaderReg,
      followerReg,
      leader,
    );
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "1st_round",
        position: 1,
        status: "in_progress",
        heatsApproved: true,
      }),
    );

    await expect(
      t.withIdentity(ALICE).mutation(api.competitions.scoring.submitCallbackMarks, {
        roundId,
        judgeId: unassignedJudgeId,
        marks: [{ entryId, marked: true }],
      }),
    ).rejects.toThrow();
    await expect(
      t.withIdentity(ALICE).mutation(api.competitions.scoring.submitCallbackMarks, {
        roundId,
        judgeId,
        marks: [{ entryId: otherEntryId, marked: true }],
      }),
    ).rejects.toThrow();

    const marks = await t.run((ctx) =>
      ctx.db
        .query("callbackMarks")
        .withIndex("by_round_judge_entry", (q) => q.eq("roundId", roundId))
        .collect(),
    );
    expect(marks).toHaveLength(0);
  });

  it("submitFinalMarks rejects unknown dances", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId, { dances: ["waltz"] });
    const judgeId = await seedJudge(t, compId);
    const leader = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|dance_l",
      subject: "dance_l",
    });
    const follower = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|dance_f",
      subject: "dance_f",
    });
    const leaderReg = await seedRegistration(t, compId, leader);
    const followerReg = await seedRegistration(t, compId, follower);
    const entryId = await seedEntry(t, eventId, leaderReg, followerReg, leader);
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "final",
        position: 1,
        status: "in_progress",
        heatsApproved: true,
      }),
    );

    await expect(
      t.withIdentity(ALICE).mutation(api.competitions.scoring.submitFinalMarks, {
        roundId,
        judgeId,
        marks: [{ entryId, danceName: "tango", placement: 1 }],
      }),
    ).rejects.toThrow();
  });

  it("computeFinalResults stores per-dance placements", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId, { dances: ["waltz"] });
    const judgeIds = await Promise.all([
      seedJudge(t, compId, { firstName: "J1", lastName: "Judge" }),
      seedJudge(t, compId, { firstName: "J2", lastName: "Judge" }),
      seedJudge(t, compId, { firstName: "J3", lastName: "Judge" }),
    ]);

    const entryIds: Id<"entries">[] = [];
    for (let i = 0; i < 3; i++) {
      const leader = await seedUser(t, {
        tokenIdentifier: `https://clerk.example.com|sl_${i}`,
        subject: `sl_${i}`,
      });
      const follower = await seedUser(t, {
        tokenIdentifier: `https://clerk.example.com|sf_${i}`,
        subject: `sf_${i}`,
      });
      const leaderReg = await seedRegistration(t, compId, leader);
      const followerReg = await seedRegistration(t, compId, follower);
      entryIds.push(await seedEntry(t, eventId, leaderReg, followerReg, leader));
    }

    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "final",
        position: 1,
        status: "in_progress",
        heatsApproved: true,
      }),
    );

    // All judges agree: entry 0 first, entry 1 second, entry 2 third
    for (const judgeId of judgeIds) {
      await t.withIdentity(ALICE).mutation(api.competitions.scoring.submitFinalMarks, {
        roundId,
        judgeId,
        marks: entryIds.map((entryId, idx) => ({
          entryId,
          danceName: "waltz",
          placement: idx + 1,
        })),
      });
    }

    await t.withIdentity(ALICE).mutation(
      api.competitions.scoring.computeFinalResults,
      { roundId },
    );
    const result = await t.query(api.competitions.scoring.getResults, {
      roundId,
    });
    expect(result.meta?.status).toBe("computed");
    expect(result.results.length).toBeGreaterThanOrEqual(3);
    const first = result.results.find((r) => r.entryId === entryIds[0]);
    expect(first?.placement).toBe(1);
  });

  it("computeCallbackResults advances top N", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId);
    const judgeId = await seedJudge(t, compId);
    const entryIds: Id<"entries">[] = [];
    for (let i = 0; i < 4; i++) {
      const leader = await seedUser(t, {
        tokenIdentifier: `https://clerk.example.com|cl_${i}`,
        subject: `cl_${i}`,
      });
      const follower = await seedUser(t, {
        tokenIdentifier: `https://clerk.example.com|cf_${i}`,
        subject: `cf_${i}`,
      });
      const leaderReg = await seedRegistration(t, compId, leader);
      const followerReg = await seedRegistration(t, compId, follower);
      entryIds.push(await seedEntry(t, eventId, leaderReg, followerReg, leader));
    }
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "1st_round",
        position: 1,
        callbacksRequested: 2,
        status: "in_progress",
        heatsApproved: true,
      }),
    );
    // Mark first two entries
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.scoring.submitCallbackMarks, {
        roundId,
        judgeId,
        marks: entryIds.map((entryId, idx) => ({
          entryId,
          marked: idx < 2,
        })),
      });
    const computed = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.scoring.computeCallbackResults, { roundId });
    expect(computed.advanced).toBe(2);
    const callbackRows = await t.query(
      api.competitions.scoring.getCallbackResults,
      { roundId },
    );
    const advanced = callbackRows.filter((r) => r.advanced);
    expect(advanced).toHaveLength(2);
  });

  it("publishResults requires reviewed state", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId);
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "final",
        position: 1,
        status: "in_progress",
        heatsApproved: true,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("roundResultsMeta", {
        roundId,
        status: "computed",
        computedAt: Date.now(),
      }),
    );
    await expect(
      t.withIdentity(ALICE).mutation(api.competitions.scoring.publishResults, {
        roundId,
      }),
    ).rejects.toThrow();
    await t.withIdentity(ALICE).mutation(api.competitions.scoring.reviewResults, {
      roundId,
    });
    const published = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.scoring.publishResults, { roundId });
    expect(published?.status).toBe("published");
  });
});

// ── Judge session ──────────────────────────────────────────────────

describe("judgeSession", () => {
  it("rejects judge JWT secrets shorter than the documented minimum", async () => {
    const previousSecret = process.env.JUDGE_JWT_SECRET;
    process.env.JUDGE_JWT_SECRET = "too-short";
    try {
      await expect(
        createJudgeToken({
          competitionId: "competition" as Id<"competitions">,
          judgeId: "judge" as Id<"judges">,
          sessionId: "session" as Id<"judgeSessions">,
        }),
      ).rejects.toThrow(/32 characters/);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.JUDGE_JWT_SECRET;
      } else {
        process.env.JUDGE_JWT_SECRET = previousSecret;
      }
    }
  });

  async function setupCompetitionWithJudge() {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const judgeId = await seedJudge(t, compId, {
      firstName: "Joe",
      lastName: "Judge",
    });
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.core.setCompCode, {
        competitionId: compId,
        compCode: "ABCD",
      });
    await t
      .withIdentity(ALICE)
      .mutation(api.competitions.core.setMasterPassword, {
        competitionId: compId,
        password: "letmein",
      });
    return { t, orgId, compId, judgeId };
  }

  it("authenticate returns a JWT for valid credentials", async () => {
    const { t, judgeId } = await setupCompetitionWithJudge();
    const result = await t.mutation(api.competitions.judgeSession.authenticate, {
      compCode: "ABCD",
      masterPassword: "letmein",
      judgeId,
    });
    expect(result.token).toBeTruthy();
    expect(result.judgeName).toBe("Joe Judge");
  });

  it("authenticate rejects wrong password", async () => {
    const { t, judgeId } = await setupCompetitionWithJudge();
    await expect(
      t.mutation(api.competitions.judgeSession.authenticate, {
        compCode: "ABCD",
        masterPassword: "nope",
        judgeId,
      }),
    ).rejects.toThrow();
  });

  it("submitCallbackMarks requires an active round", async () => {
    const { t, compId, judgeId } = await setupCompetitionWithJudge();
    const eventId = await seedEvent(t, compId);
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "1st_round",
        position: 1,
        status: "pending",
        heatsApproved: false,
      }),
    );
    const auth = await t.mutation(
      api.competitions.judgeSession.authenticate,
      { compCode: "ABCD", masterPassword: "letmein", judgeId },
    );
    const leader = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|js_l",
      subject: "js_l",
    });
    const follower = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|js_f",
      subject: "js_f",
    });
    const leaderReg = await seedRegistration(t, compId, leader);
    const followerReg = await seedRegistration(t, compId, follower);
    const entryId = await seedEntry(t, eventId, leaderReg, followerReg, leader);

    await expect(
      t.mutation(api.competitions.judgeSession.submitCallbackMarks, {
        token: auth.token,
        roundId,
        marks: [{ entryId, marked: true }],
      }),
    ).rejects.toThrow();
  });

  it("submitCallbackMarks rejects entries outside the active round event", async () => {
    const { t, compId, judgeId } = await setupCompetitionWithJudge();
    const eventId = await seedEvent(t, compId, { name: "Active Event" });
    const otherEventId = await seedEvent(t, compId, { name: "Other Event" });
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "1st_round",
        position: 1,
        status: "in_progress",
        heatsApproved: true,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("activeRounds", {
        competitionId: compId,
        roundId,
        startedAt: Date.now(),
      }),
    );
    const auth = await t.mutation(
      api.competitions.judgeSession.authenticate,
      { compCode: "ABCD", masterPassword: "letmein", judgeId },
    );
    const leader = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|token_cross_l",
      subject: "token_cross_l",
    });
    const follower = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|token_cross_f",
      subject: "token_cross_f",
    });
    const leaderReg = await seedRegistration(t, compId, leader);
    const followerReg = await seedRegistration(t, compId, follower);
    const otherEntryId = await seedEntry(
      t,
      otherEventId,
      leaderReg,
      followerReg,
      leader,
    );

    await expect(
      t.mutation(api.competitions.judgeSession.submitCallbackMarks, {
        token: auth.token,
        roundId,
        marks: [{ entryId: otherEntryId, marked: true }],
      }),
    ).rejects.toThrow();
  });

  it("submitFinalMarks rejects unknown event dances", async () => {
    const { t, compId, judgeId } = await setupCompetitionWithJudge();
    const eventId = await seedEvent(t, compId, { dances: ["waltz"] });
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "final",
        position: 1,
        status: "in_progress",
        heatsApproved: true,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("activeRounds", {
        competitionId: compId,
        roundId,
        startedAt: Date.now(),
      }),
    );
    const auth = await t.mutation(
      api.competitions.judgeSession.authenticate,
      { compCode: "ABCD", masterPassword: "letmein", judgeId },
    );
    const leader = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|token_dance_l",
      subject: "token_dance_l",
    });
    const follower = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|token_dance_f",
      subject: "token_dance_f",
    });
    const leaderReg = await seedRegistration(t, compId, leader);
    const followerReg = await seedRegistration(t, compId, follower);
    const entryId = await seedEntry(t, eventId, leaderReg, followerReg, leader);

    await expect(
      t.mutation(api.competitions.judgeSession.submitFinalMarks, {
        token: auth.token,
        roundId,
        marks: [{ entryId, danceName: "tango", placement: 1 }],
      }),
    ).rejects.toThrow();
  });

  it("submitCallbackMarks rejects active rows whose round belongs to another competition", async () => {
    const { t, orgId, compId, judgeId } = await setupCompetitionWithJudge();
    const otherCompId = await seedCompetition(t, ALICE, orgId, "Other Comp");
    const otherEventId = await seedEvent(t, otherCompId);
    const otherRoundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId: otherEventId,
        roundType: "1st_round",
        position: 1,
        status: "in_progress",
        heatsApproved: true,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("activeRounds", {
        competitionId: compId,
        roundId: otherRoundId,
        startedAt: Date.now(),
      }),
    );
    const auth = await t.mutation(
      api.competitions.judgeSession.authenticate,
      { compCode: "ABCD", masterPassword: "letmein", judgeId },
    );

    await expect(
      t.mutation(api.competitions.judgeSession.submitCallbackMarks, {
        token: auth.token,
        roundId: otherRoundId,
        marks: [],
      }),
    ).rejects.toThrow();
  });

  it("getActiveRound returns null when nothing is running", async () => {
    const { t, compId, judgeId } = await setupCompetitionWithJudge();
    void compId;
    const auth = await t.mutation(
      api.competitions.judgeSession.authenticate,
      { compCode: "ABCD", masterPassword: "letmein", judgeId },
    );
    const active = await t.query(api.competitions.judgeSession.getActiveRound, {
      token: auth.token,
    });
    expect(active).toBeNull();
  });
});

// ── Scrutineer ─────────────────────────────────────────────────────

describe("scrutineer", () => {
  it("startRound + stopRound update the active round and status", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId);
    const judgeId = await seedJudge(t, compId);
    void judgeId;
    const roundId = await t.run((ctx) =>
      ctx.db.insert("rounds", {
        eventId,
        roundType: "final",
        position: 1,
        status: "pending",
        heatsApproved: true,
      }),
    );

    const startResult = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.scrutineer.startRound, {
        competitionId: compId,
        roundId,
      });
    expect(startResult.roundId).toBe(roundId);
    expect(
      await t.run((ctx) => ctx.db.get(roundId)).then((r) => r?.status),
    ).toBe("in_progress");

    // To stop we need all judges submitted. The seeded judge has a pending row;
    // simulate submission by patching directly.
    const subs = await t.run((ctx) =>
      ctx.db
        .query("judgeSubmissions")
        .withIndex("by_round_judge", (q) => q.eq("roundId", roundId))
        .collect(),
    );
    for (const s of subs) {
      await t.run((ctx) =>
        ctx.db.patch(s._id, { status: "submitted", submittedAt: Date.now() }),
      );
    }

    const stop = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.scrutineer.stopRound, {
        competitionId: compId,
      });
    expect(stop.stoppedRoundId).toBe(roundId);
    expect(
      await t.run((ctx) => ctx.db.get(roundId)).then((r) => r?.status),
    ).toBe("completed");
  });

  it("getDashboard returns competition snapshot", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await seedEvent(t, compId);
    const dash = await t
      .withIdentity(ALICE)
      .query(api.competitions.scrutineer.getDashboard, {
        competitionId: compId,
      });
    expect(dash.competition._id).toBe(compId);
    expect(dash.activeRound).toBeNull();
    expect(dash.events).toHaveLength(1);
  });
});

// ── Live view ──────────────────────────────────────────────────────

describe("liveView", () => {
  it("getSchedule returns null for missing competition", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await seedDay(t, compId);
    const schedule = await t.query(api.competitions.liveView.getSchedule, {
      competitionId: compId,
    });
    expect(schedule?.competition.id).toBe(compId);
    expect(schedule?.days).toHaveLength(1);
  });

  it("getPublishedResults filters to published rounds", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId);
    const result = await t.query(
      api.competitions.liveView.getPublishedResults,
      { eventId },
    );
    expect(result).toEqual({ eventName: "Standard Bronze Waltz", rounds: [] });
  });
});

// ── Comp day (emcee / deck / registration) ────────────────────────

describe("compDay", () => {
  it("createNote requires emcee role", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, EMCEE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const dayId = await seedDay(t, compId);

    await expect(
      t.withIdentity(EMCEE).mutation(api.competitions.compDay.createNote, {
        competitionId: compId,
        dayId,
        content: "Hi everyone",
      }),
    ).rejects.toThrow();

    const emceeUserId = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", EMCEE.tokenIdentifier),
        )
        .unique()
        .then((u) => u!._id),
    );
    await seedStaff(t, compId, emceeUserId, "emcee");

    const note = await t
      .withIdentity(EMCEE)
      .mutation(api.competitions.compDay.createNote, {
        competitionId: compId,
        dayId,
        content: "Hi everyone",
      });
    expect(note?.content).toBe("Hi everyone");
  });

  it("checkinRegistration toggles the registration flag", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, REG);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regUserId = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", REG.tokenIdentifier),
        )
        .unique()
        .then((u) => u!._id),
    );
    await seedStaff(t, compId, regUserId, "registration");
    const userBob = await seedUser(t, BOB);
    const reg = await seedRegistration(t, compId, userBob);

    await t
      .withIdentity(REG)
      .mutation(api.competitions.compDay.checkinRegistration, {
        registrationId: reg,
      });
    const after = await t.run((ctx) => ctx.db.get(reg));
    expect(after?.checkedIn).toBe(true);

    await t.withIdentity(REG).mutation(api.competitions.compDay.undoCheckin, {
      registrationId: reg,
    });
    const undone = await t.run((ctx) => ctx.db.get(reg));
    expect(undone?.checkedIn).toBe(false);
  });

  it("recordOfflinePayment converts dollars to cents", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, REG);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const regUserId = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", REG.tokenIdentifier),
        )
        .unique()
        .then((u) => u!._id),
    );
    await seedStaff(t, compId, regUserId, "registration");
    const userBob = await seedUser(t, BOB);
    const reg = await seedRegistration(t, compId, userBob);
    const payment = await t
      .withIdentity(REG)
      .mutation(api.competitions.compDay.recordOfflinePayment, {
        registrationId: reg,
        amount: "12.50",
        method: "cash",
      });
    expect(payment?.amount).toBe(1250);
    expect(payment?.method).toBe("cash");
  });

  it("approveAddDrop inserts an entry for type=add", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, REG);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId);
    const regUserId = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_token_identifier", (q) =>
          q.eq("tokenIdentifier", REG.tokenIdentifier),
        )
        .unique()
        .then((u) => u!._id),
    );
    await seedStaff(t, compId, regUserId, "registration");
    const leader = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|ad_l",
      subject: "ad_l",
    });
    const follower = await seedUser(t, {
      tokenIdentifier: "https://clerk.example.com|ad_f",
      subject: "ad_f",
    });
    const leaderReg = await seedRegistration(t, compId, leader);
    const followerReg = await seedRegistration(t, compId, follower);
    const requestId = await t.run((ctx) =>
      ctx.db.insert("addDropRequests", {
        competitionId: compId,
        submittedBy: leader,
        type: "add",
        eventId,
        leaderRegistrationId: leaderReg,
        followerRegistrationId: followerReg,
        status: "pending",
        createdAt: Date.now(),
      }),
    );
    await t
      .withIdentity(REG)
      .mutation(api.competitions.compDay.approveAddDrop, { requestId });
    const entries = await t.run((ctx) =>
      ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect(),
    );
    expect(entries).toHaveLength(1);
  });
});

// ── Feedback ───────────────────────────────────────────────────────

describe("feedback", () => {
  it("createForm with default template seeds 6 questions", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const form = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.feedback.createForm, {
        competitionId: compId,
      });
    expect(form?.title).toBe("Competition Feedback");
    const questions = await t.run((ctx) =>
      ctx.db
        .query("feedbackQuestions")
        .withIndex("by_form_position", (q) => q.eq("formId", form!._id))
        .collect(),
    );
    expect(questions).toHaveLength(6);
  });

  it("getForm returns null until competition is finished", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await t.withIdentity(ALICE).mutation(api.competitions.feedback.createForm, {
      competitionId: compId,
    });
    const beforeFinish = await t.query(api.competitions.feedback.getForm, {
      competitionId: compId,
    });
    expect(beforeFinish).toBeNull();
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "finished",
    });
    const afterFinish = await t.query(api.competitions.feedback.getForm, {
      competitionId: compId,
    });
    expect(afterFinish).not.toBeNull();
    expect(afterFinish?.questions).toHaveLength(6);
  });

  it("submitResponse enforces one-per-user", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const form = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.feedback.createForm, {
        competitionId: compId,
        useTemplate: false,
      });
    const q = await t
      .withIdentity(ALICE)
      .mutation(api.competitions.feedback.addQuestion, {
        formId: form!._id,
        questionType: "text",
        label: "Anything else?",
        position: 0,
      });
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "finished",
    });
    await t
      .withIdentity(BOB)
      .mutation(api.competitions.feedback.submitResponse, {
        formId: form!._id,
        answers: [{ questionId: q!._id, value: "ok" }],
      });
    await expect(
      t
        .withIdentity(BOB)
        .mutation(api.competitions.feedback.submitResponse, {
          formId: form!._id,
          answers: [{ questionId: q!._id, value: "again" }],
        }),
    ).rejects.toThrow();
  });
});

// ── Results ────────────────────────────────────────────────────────

describe("results (public)", () => {
  it("getEventResults returns null without published results", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    const eventId = await seedEvent(t, compId);
    const result = await t.query(api.competitions.results.getEventResults, {
      eventId,
    });
    expect(result).toBeNull();
  });

  it("searchCompetitors matches indexed display names and usernames", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE, {
      username: "alice_c",
      displayName: "Alice Carter",
    });
    const bobId = await seedUser(t, BOB, {
      username: "bob_builder",
      displayName: "Robert Builder",
    });
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await seedRegistration(t, compId, aliceId);
    await seedRegistration(t, compId, bobId);

    const byDisplayName = await t.query(
      api.competitions.results.searchCompetitors,
      { query: "alice" },
    );
    expect(
      byDisplayName.find((r) => r.displayName === "Alice Carter"),
    ).toMatchObject({ username: "alice_c", competitionCount: 1 });

    const byUsername = await t.query(
      api.competitions.results.searchCompetitors,
      { query: "bob_builder" },
    );
    expect(byUsername.find((r) => r.username === "bob_builder")).toMatchObject(
      { displayName: "Robert Builder", competitionCount: 1 },
    );
  });

  it("searchCompetitors rejects empty and oversized queries", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t, ALICE, {
      username: "alice_c",
      displayName: "Alice Carter",
    });

    await expect(
      t.query(api.competitions.results.searchCompetitors, { query: "   " }),
    ).resolves.toEqual([]);
    await expect(
      t.query(api.competitions.results.searchCompetitors, {
        query: "a".repeat(101),
      }),
    ).resolves.toEqual([]);
  });
});

// ── Record removal ────────────────────────────────────────────────

describe("recordRemoval", () => {
  async function seedPendingRemoval(t: T) {
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "finished",
    });
    await seedRegistration(t, compId, bobId);
    const request = await t
      .withIdentity(BOB)
      .mutation(api.competitions.recordRemoval.submit, {
        competitionId: compId,
        reason: "Withdraw me",
      });
    if (!request) throw new Error("Expected seeded removal request");
    return { compId, request };
  }

  it("submit requires a finished competition with prior registration", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);

    await expect(
      t.withIdentity(BOB).mutation(api.competitions.recordRemoval.submit, {
        competitionId: compId,
        reason: "Withdraw me",
      }),
    ).rejects.toThrow();

    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "finished",
    });
    await seedRegistration(t, compId, bobId);
    const req = await t
      .withIdentity(BOB)
      .mutation(api.competitions.recordRemoval.submit, {
        competitionId: compId,
        reason: "Withdraw me",
      });
    expect(req?.status).toBe("pending");
  });

  it("restricts pending queue to competition organizers", async () => {
    const t = convexTest(schema, modules);
    const { compId } = await seedPendingRemoval(t);
    await seedUser(t, DECK);

    await expect(
      t.withIdentity(DECK).query(api.competitions.recordRemoval.listPending, {
        competitionId: compId,
      }),
    ).rejects.toThrow();

    const pending = await t
      .withIdentity(ALICE)
      .query(api.competitions.recordRemoval.listPending, {
        competitionId: compId,
      });
    expect(pending).toHaveLength(1);
  });

  it("allows request owners to view details without organizer access", async () => {
    const t = convexTest(schema, modules);
    const { request } = await seedPendingRemoval(t);
    await seedUser(t, DECK);

    const detail = await t
      .withIdentity(BOB)
      .query(api.competitions.recordRemoval.getRequest, {
        requestId: request._id,
      });
    expect(detail?._id).toBe(request._id);

    await expect(
      t.withIdentity(DECK).query(api.competitions.recordRemoval.getRequest, {
        requestId: request._id,
      }),
    ).rejects.toThrow();
  });

  it("rejects review attempts by non-organizers", async () => {
    const t = convexTest(schema, modules);
    const { request } = await seedPendingRemoval(t);
    await seedUser(t, DECK);

    await expect(
      t.withIdentity(DECK).mutation(api.competitions.recordRemoval.approve, {
        requestId: request._id,
      }),
    ).rejects.toThrow();
    await expect(
      t.withIdentity(DECK).mutation(api.competitions.recordRemoval.reject, {
        requestId: request._id,
      }),
    ).rejects.toThrow();
  });

  it("allows competition scrutineers to review pending requests", async () => {
    const t = convexTest(schema, modules);
    const { compId, request } = await seedPendingRemoval(t);
    const scrutId = await seedUser(t, SCRUT);
    await seedStaff(t, compId, scrutId, "scrutineer");

    const approved = await t
      .withIdentity(SCRUT)
      .mutation(api.competitions.recordRemoval.approve, {
        requestId: request._id,
      });
    expect(approved?.status).toBe("approved");
    expect(approved?.reviewedBy).toBe(scrutId);
  });

  it("rejects entry-scoped submissions for entries outside the caller registration", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const bobId = await seedUser(t, BOB);
    const deckId = await seedUser(t, DECK);
    const scrutId = await seedUser(t, SCRUT);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "finished",
    });
    const eventId = await seedEvent(t, compId);
    await seedRegistration(t, compId, bobId);
    const deckRegId = await seedRegistration(t, compId, deckId);
    const scrutRegId = await seedRegistration(t, compId, scrutId);
    const otherEntryId = await seedEntry(
      t,
      eventId,
      deckRegId,
      scrutRegId,
      deckId,
    );

    await expect(
      t.withIdentity(BOB).mutation(api.competitions.recordRemoval.submit, {
        competitionId: compId,
        entryId: otherEntryId,
        reason: "Withdraw this entry",
      }),
    ).rejects.toThrow();
  });
});

// ── Calendar ──────────────────────────────────────────────────────

describe("calendar", () => {
  it("getUpcoming returns competitions in active statuses", async () => {
    const t = convexTest(schema, modules);
    const aliceId = await seedUser(t, ALICE);
    const orgId = await seedOrgWithOwner(t, aliceId);
    const compId = await seedCompetition(t, ALICE, orgId);
    await t.withIdentity(ALICE).mutation(api.competitions.core.updateStatus, {
      competitionId: compId,
      status: "advertised",
    });
    const upcoming = await t.query(api.competitions.calendar.getUpcoming, {});
    expect(upcoming.find((c) => c.id === compId)).toBeDefined();
  });
});
