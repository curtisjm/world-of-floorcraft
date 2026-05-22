import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

// Convex function tests for the syllabus domain (Task 3 of the Convex
// migration). They exercise the public read queries and the idempotent
// seed/import mutations through the `convex-test` harness.

const setup = () => convexTest(schema, modules);

describe("syllabus dances", () => {
  it("lists dances ordered by display name with figure counts", async () => {
    const t = setup();
    const waltzId = await t.mutation(internal.syllabus.import.upsertDance, {
      name: "waltz",
      displayName: "Waltz",
      timeSignature: "3/4",
    });
    await t.mutation(internal.syllabus.import.upsertDance, {
      name: "foxtrot",
      displayName: "Foxtrot",
    });
    await t.mutation(internal.syllabus.import.upsertFigure, {
      danceId: waltzId,
      name: "Natural Turn",
      level: "associate",
    });

    const dances = await t.query(api.syllabus.dances.list, {});

    expect(dances.map((d) => d.displayName)).toEqual(["Foxtrot", "Waltz"]);
    expect(dances.find((d) => d.name === "waltz")?.figureCount).toBe(1);
    expect(dances.find((d) => d.name === "foxtrot")?.figureCount).toBe(0);
  });

  it("finds a dance by slug and returns null for an unknown slug", async () => {
    const t = setup();
    await t.mutation(internal.syllabus.import.upsertDance, {
      name: "tango",
      displayName: "Tango",
    });

    const found = await t.query(api.syllabus.dances.getByName, {
      name: "tango",
    });
    const missing = await t.query(api.syllabus.dances.getByName, {
      name: "salsa",
    });

    expect(found?.displayName).toBe("Tango");
    expect(missing).toBeNull();
  });
});

describe("syllabus figures", () => {
  it("lists figures by dance, optionally filtered by level", async () => {
    const t = setup();
    const danceId = await t.mutation(internal.syllabus.import.upsertDance, {
      name: "waltz",
      displayName: "Waltz",
    });
    await t.mutation(internal.syllabus.import.upsertFigure, {
      danceId,
      name: "Closed Change",
      level: "student_teacher",
      figureNumber: 2,
    });
    await t.mutation(internal.syllabus.import.upsertFigure, {
      danceId,
      name: "Natural Turn",
      level: "student_teacher",
      figureNumber: 1,
    });
    await t.mutation(internal.syllabus.import.upsertFigure, {
      danceId,
      name: "Whisk",
      level: "associate",
      figureNumber: 8,
    });

    const all = await t.query(api.syllabus.figures.listByDance, { danceId });
    const associate = await t.query(api.syllabus.figures.listByDance, {
      danceId,
      level: "associate",
    });

    // Ordered by figure number, then name.
    expect(all.map((f) => f.name)).toEqual([
      "Natural Turn",
      "Closed Change",
      "Whisk",
    ]);
    expect(associate.map((f) => f.name)).toEqual(["Whisk"]);
  });

  it("reads a figure with its preceding and following edges", async () => {
    const t = setup();
    const danceId = await t.mutation(internal.syllabus.import.upsertDance, {
      name: "waltz",
      displayName: "Waltz",
    });
    const before = await t.mutation(internal.syllabus.import.upsertFigure, {
      danceId,
      name: "Natural Turn",
      level: "student_teacher",
    });
    const figure = await t.mutation(internal.syllabus.import.upsertFigure, {
      danceId,
      name: "Closed Change",
      level: "student_teacher",
    });
    const after = await t.mutation(internal.syllabus.import.upsertFigure, {
      danceId,
      name: "Reverse Turn",
      level: "student_teacher",
    });
    await t.mutation(internal.syllabus.import.upsertEdge, {
      sourceFigureId: before,
      targetFigureId: figure,
      level: "student_teacher",
    });
    await t.mutation(internal.syllabus.import.upsertEdge, {
      sourceFigureId: figure,
      targetFigureId: after,
      level: "student_teacher",
      conditions: "At corner",
    });

    const detail = await t.query(api.syllabus.figures.getDetail, {
      figureId: figure,
    });
    const neighbors = await t.query(api.syllabus.figures.neighbors, {
      figureId: figure,
    });

    expect(detail?.name).toBe("Closed Change");
    expect(neighbors.precedes.map((e) => e.figure?.name)).toEqual([
      "Natural Turn",
    ]);
    expect(neighbors.follows.map((e) => e.figure?.name)).toEqual([
      "Reverse Turn",
    ]);
    expect(neighbors.follows[0].conditions).toBe("At corner");
  });

  it("returns null for a malformed figure id", async () => {
    const t = setup();
    const detail = await t.query(api.syllabus.figures.getDetail, {
      figureId: "not-a-real-id",
    });
    expect(detail).toBeNull();
  });

  it("returns the whole-dance graph as one query", async () => {
    const t = setup();
    const danceId = await t.mutation(internal.syllabus.import.upsertDance, {
      name: "waltz",
      displayName: "Waltz",
    });
    const a = await t.mutation(internal.syllabus.import.upsertFigure, {
      danceId,
      name: "Natural Turn",
      level: "student_teacher",
    });
    const b = await t.mutation(internal.syllabus.import.upsertFigure, {
      danceId,
      name: "Closed Change",
      level: "student_teacher",
    });
    await t.mutation(internal.syllabus.import.upsertEdge, {
      sourceFigureId: a,
      targetFigureId: b,
      level: "student_teacher",
    });

    const graph = await t.query(api.syllabus.figures.danceGraph, { danceId });

    expect(graph.figures).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].sourceFigureId).toBe(a);
    expect(graph.edges[0].targetFigureId).toBe(b);
  });
});

describe("syllabus import", () => {
  it("upserts a dance, figures and an edge idempotently", async () => {
    const t = setup();

    // Two passes over the same data must not create duplicates.
    for (let pass = 0; pass < 2; pass += 1) {
      const danceId = await t.mutation(internal.syllabus.import.upsertDance, {
        name: "waltz",
        displayName: "Waltz",
      });
      const first = await t.mutation(internal.syllabus.import.upsertFigure, {
        danceId,
        name: "Natural Turn",
        level: "student_teacher",
      });
      const second = await t.mutation(internal.syllabus.import.upsertFigure, {
        danceId,
        name: "Closed Change",
        level: "student_teacher",
      });
      await t.mutation(internal.syllabus.import.upsertEdge, {
        sourceFigureId: first,
        targetFigureId: second,
        level: "student_teacher",
      });
    }

    const counts = await t.run(async (ctx) => ({
      dances: (await ctx.db.query("dances").collect()).length,
      figures: (await ctx.db.query("figures").collect()).length,
      edges: (await ctx.db.query("figureEdges").collect()).length,
    }));

    expect(counts).toEqual({ dances: 1, figures: 2, edges: 1 });
  });

  it("bulk imports a dance via importSyllabus and stays idempotent", async () => {
    const t = setup();
    const payload = {
      dances: [{ name: "waltz", displayName: "Waltz", timeSignature: "3/4" }],
      figures: [
        {
          danceName: "waltz",
          name: "Natural Turn",
          level: "student_teacher" as const,
          figureNumber: 1,
        },
        {
          danceName: "waltz",
          name: "Closed Change",
          level: "student_teacher" as const,
          figureNumber: 2,
        },
      ],
      edges: [
        {
          danceName: "waltz",
          sourceName: "Natural Turn",
          targetName: "Closed Change",
          level: "student_teacher" as const,
        },
      ],
    };

    const first = await t.mutation(
      internal.syllabus.import.importSyllabus,
      payload,
    );
    expect(first).toEqual({ dances: 1, figures: 2, edges: 1 });

    await t.mutation(internal.syllabus.import.importSyllabus, payload);

    const counts = await t.run(async (ctx) => ({
      dances: (await ctx.db.query("dances").collect()).length,
      figures: (await ctx.db.query("figures").collect()).length,
      edges: (await ctx.db.query("figureEdges").collect()).length,
    }));
    expect(counts).toEqual({ dances: 1, figures: 2, edges: 1 });
  });
});
