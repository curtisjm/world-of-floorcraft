import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

// Convex function tests for the routines domain (Task 4 of the Convex
// migration). They exercise CRUD, ordered-entry manipulation, ownership
// guards, and transition validation against the Convex syllabus edges
// through the `convex-test` harness.

const setup = () => convexTest(schema, modules);

const ALICE = {
  tokenIdentifier: "https://clerk.example.com|user_alice",
  subject: "user_alice",
};

const BOB = {
  tokenIdentifier: "https://clerk.example.com|user_bob",
  subject: "user_bob",
};

async function seedUser(
  t: ReturnType<typeof convexTest>,
  identity: typeof ALICE,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      isPrivate: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function seedWaltz(t: ReturnType<typeof convexTest>) {
  const danceId = await t.mutation(internal.syllabus.import.upsertDance, {
    name: "waltz",
    displayName: "Waltz",
  });
  const natural = await t.mutation(internal.syllabus.import.upsertFigure, {
    danceId,
    name: "Natural Turn",
    level: "student_teacher",
    figureNumber: 1,
  });
  const closed = await t.mutation(internal.syllabus.import.upsertFigure, {
    danceId,
    name: "Closed Change",
    level: "student_teacher",
    figureNumber: 2,
  });
  const reverse = await t.mutation(internal.syllabus.import.upsertFigure, {
    danceId,
    name: "Reverse Turn",
    level: "student_teacher",
    figureNumber: 3,
  });
  await t.mutation(internal.syllabus.import.upsertEdge, {
    sourceFigureId: natural,
    targetFigureId: closed,
    level: "student_teacher",
  });
  await t.mutation(internal.syllabus.import.upsertEdge, {
    sourceFigureId: closed,
    targetFigureId: reverse,
    level: "student_teacher",
  });
  return { danceId, natural, closed, reverse };
}

describe("routines.create", () => {
  it("creates an empty routine owned by the caller", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId } = await seedWaltz(t);

    const routine = await t.withIdentity(ALICE).mutation(api.routines.create, {
      danceId,
      name: "  Comp Waltz  ",
    });

    expect(routine.name).toBe("Comp Waltz");
    expect(routine.isPublished).toBe(false);
    expect(routine.danceId).toBe(danceId);
  });

  it("rejects an empty name", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId } = await seedWaltz(t);

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.routines.create, { danceId, name: "   " }),
    ).rejects.toThrow();
  });

  it("rejects unauthenticated callers", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId } = await seedWaltz(t);

    await expect(
      t.mutation(api.routines.create, { danceId, name: "X" }),
    ).rejects.toThrow();
  });
});

describe("routines.listMine and listByDance", () => {
  it("lists only the caller's routines, oldest first", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const { danceId } = await seedWaltz(t);

    await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "First" });
    await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "Second" });
    await t
      .withIdentity(BOB)
      .mutation(api.routines.create, { danceId, name: "Bob's" });

    const alice = await t
      .withIdentity(ALICE)
      .query(api.routines.listMine, {});
    expect(alice.map((r) => r.name)).toEqual(["First", "Second"]);

    const bob = await t.withIdentity(BOB).query(api.routines.listMine, {});
    expect(bob.map((r) => r.name)).toEqual(["Bob's"]);
  });

  it("filters listByDance to the requested dance", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId: waltzId } = await seedWaltz(t);
    const foxtrotId = await t.mutation(internal.syllabus.import.upsertDance, {
      name: "foxtrot",
      displayName: "Foxtrot",
    });

    await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId: waltzId, name: "Waltz A" });
    await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId: waltzId, name: "Waltz B" });
    await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId: foxtrotId, name: "Fox A" });

    const waltz = await t
      .withIdentity(ALICE)
      .query(api.routines.listByDance, { danceId: waltzId });
    expect(waltz.map((r) => r.name)).toEqual(["Waltz A", "Waltz B"]);

    const fox = await t
      .withIdentity(ALICE)
      .query(api.routines.listByDance, { danceId: foxtrotId });
    expect(fox.map((r) => r.name)).toEqual(["Fox A"]);
  });
});

describe("routines.get", () => {
  it("returns the routine joined with entry figure details", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId, natural, closed } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R1" });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: natural,
      position: 0,
    });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: closed,
      position: 1,
    });

    const detail = await t
      .withIdentity(ALICE)
      .query(api.routines.get, { routineId: routine.id });

    expect(detail).not.toBeNull();
    expect(detail!.name).toBe("R1");
    expect(detail!.entries.map((e) => e.figureName)).toEqual([
      "Natural Turn",
      "Closed Change",
    ]);
    expect(detail!.entries.map((e) => e.position)).toEqual([0, 1]);
  });

  it("returns null for routines the caller does not own", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const { danceId } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "Private" });

    const fromBob = await t
      .withIdentity(BOB)
      .query(api.routines.get, { routineId: routine.id });
    expect(fromBob).toBeNull();
  });
});

describe("routines.update", () => {
  it("updates name and description", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "Old" });

    const updated = await t.withIdentity(ALICE).mutation(api.routines.update, {
      routineId: routine.id,
      name: "New",
      description: "Notes",
    });

    expect(updated?.name).toBe("New");
    expect(updated?.description).toBe("Notes");
  });

  it("returns null when the caller does not own the routine", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const { danceId } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "Mine" });

    const result = await t
      .withIdentity(BOB)
      .mutation(api.routines.update, { routineId: routine.id, name: "Yours" });
    expect(result).toBeNull();
  });

  it("rejects an empty new name", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "Old" });

    await expect(
      t
        .withIdentity(ALICE)
        .mutation(api.routines.update, { routineId: routine.id, name: " " }),
    ).rejects.toThrow();
  });
});

describe("routines.setPublished", () => {
  it("flips publish state explicitly", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "P" });
    expect(routine.isPublished).toBe(false);

    const published = await t
      .withIdentity(ALICE)
      .mutation(api.routines.setPublished, {
        routineId: routine.id,
        isPublished: true,
      });
    expect(published?.isPublished).toBe(true);

    const unpublished = await t
      .withIdentity(ALICE)
      .mutation(api.routines.setPublished, {
        routineId: routine.id,
        isPublished: false,
      });
    expect(unpublished?.isPublished).toBe(false);
  });
});

describe("routines.addEntry and removeEntry", () => {
  it("keeps positions dense when inserting in the middle", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId, natural, closed, reverse } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R" });

    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: natural,
      position: 0,
    });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: reverse,
      position: 1,
    });
    // Insert in the middle.
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: closed,
      position: 1,
    });

    const detail = await t
      .withIdentity(ALICE)
      .query(api.routines.get, { routineId: routine.id });
    expect(detail!.entries.map((e) => e.figureName)).toEqual([
      "Natural Turn",
      "Closed Change",
      "Reverse Turn",
    ]);
    expect(detail!.entries.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it("shifts entries down after removeEntry", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId, natural, closed, reverse } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R" });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: natural,
      position: 0,
    });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: closed,
      position: 1,
    });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: reverse,
      position: 2,
    });

    const detail = await t
      .withIdentity(ALICE)
      .query(api.routines.get, { routineId: routine.id });
    const middleEntry = detail!.entries[1];

    const result = await t
      .withIdentity(ALICE)
      .mutation(api.routines.removeEntry, {
        routineId: routine.id,
        entryId: middleEntry.id,
      });
    expect(result.success).toBe(true);

    const after = await t
      .withIdentity(ALICE)
      .query(api.routines.get, { routineId: routine.id });
    expect(after!.entries.map((e) => e.figureName)).toEqual([
      "Natural Turn",
      "Reverse Turn",
    ]);
    expect(after!.entries.map((e) => e.position)).toEqual([0, 1]);
  });

  it("blocks non-owners from mutating entries", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const { danceId, natural } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R" });

    const result = await t.withIdentity(BOB).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: natural,
      position: 0,
    });
    expect(result).toBeNull();
  });
});

describe("routines.reorderEntries", () => {
  it("rewrites positions to match the provided id order", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId, natural, closed, reverse } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R" });
    for (const figureId of [natural, closed, reverse]) {
      await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
        routineId: routine.id,
        figureId,
        position: 9999,
      });
    }
    const detail = await t
      .withIdentity(ALICE)
      .query(api.routines.get, { routineId: routine.id });
    const reversed = [...detail!.entries]
      .reverse()
      .map((e) => e.id);

    const result = await t
      .withIdentity(ALICE)
      .mutation(api.routines.reorderEntries, {
        routineId: routine.id,
        entryIds: reversed,
      });
    expect(result?.success).toBe(true);

    const after = await t
      .withIdentity(ALICE)
      .query(api.routines.get, { routineId: routine.id });
    expect(after!.entries.map((e) => e.figureName)).toEqual([
      "Reverse Turn",
      "Closed Change",
      "Natural Turn",
    ]);
    expect(after!.entries.map((e) => e.position)).toEqual([0, 1, 2]);
  });

  it("rejects an entry list that does not match the routine's entries", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId, natural, closed } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R" });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: natural,
      position: 0,
    });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: closed,
      position: 1,
    });
    const detail = await t
      .withIdentity(ALICE)
      .query(api.routines.get, { routineId: routine.id });
    const firstId = detail!.entries[0].id;

    await expect(
      t.withIdentity(ALICE).mutation(api.routines.reorderEntries, {
        routineId: routine.id,
        entryIds: [firstId, firstId],
      }),
    ).rejects.toThrow();
  });
});

describe("routines.remove", () => {
  it("deletes the routine and every entry", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId, natural, closed } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R" });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: natural,
      position: 0,
    });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: closed,
      position: 1,
    });

    const result = await t
      .withIdentity(ALICE)
      .mutation(api.routines.remove, { routineId: routine.id });
    expect(result.success).toBe(true);

    const counts = await t.run(async (ctx) => ({
      routines: (await ctx.db.query("routines").collect()).length,
      entries: (await ctx.db.query("routineEntries").collect()).length,
    }));
    expect(counts).toEqual({ routines: 0, entries: 0 });
  });

  it("returns success=false when the caller does not own the routine", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    await seedUser(t, BOB);
    const { danceId } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R" });

    const result = await t
      .withIdentity(BOB)
      .mutation(api.routines.remove, { routineId: routine.id });
    expect(result.success).toBe(false);
  });
});

describe("routine transitions against syllabus edges", () => {
  // The builder UI queries `api.syllabus.figures.neighbors` for the most
  // recently added entry to filter suggested next figures. These tests
  // anchor that contract end-to-end on Convex data so a future schema or
  // helper change in the syllabus module would catch a regression here.
  it("returns the syllabus-edge follows for the last entry's figure", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId, natural, closed, reverse } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R" });
    await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
      routineId: routine.id,
      figureId: natural,
      position: 0,
    });

    const detail = await t
      .withIdentity(ALICE)
      .query(api.routines.get, { routineId: routine.id });
    const lastFigureId = detail!.entries.at(-1)!.figureId;

    const neighbors = await t.query(api.syllabus.figures.neighbors, {
      figureId: lastFigureId,
    });

    expect(neighbors.follows.map((e) => e.targetFigureId)).toEqual([closed]);
    // Sanity check: `reverse` should not be reachable directly from `natural`.
    expect(neighbors.follows.map((e) => e.targetFigureId)).not.toContain(
      reverse,
    );
  });

  it("each transition between consecutive entries has a matching syllabus edge", async () => {
    const t = setup();
    await seedUser(t, ALICE);
    const { danceId, natural, closed, reverse } = await seedWaltz(t);
    const routine = await t
      .withIdentity(ALICE)
      .mutation(api.routines.create, { danceId, name: "R" });
    for (const figureId of [natural, closed, reverse]) {
      await t.withIdentity(ALICE).mutation(api.routines.addEntry, {
        routineId: routine.id,
        figureId,
        position: 9999,
      });
    }

    const detail = await t
      .withIdentity(ALICE)
      .query(api.routines.get, { routineId: routine.id });
    const entries = detail!.entries;

    for (let i = 0; i < entries.length - 1; i += 1) {
      const neighbors = await t.query(api.syllabus.figures.neighbors, {
        figureId: entries[i].figureId,
      });
      const reachable = new Set(
        neighbors.follows.map((e) => e.targetFigureId),
      );
      expect(reachable.has(entries[i + 1].figureId)).toBe(true);
    }
  });
});
