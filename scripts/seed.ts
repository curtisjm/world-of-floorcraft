import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { parse } from "yaml";
import * as schema from "../src/db/schema";

const DATA_DIR = join(__dirname, "..", "data", "extracted");

interface RawStep {
  step_number: number;
  feet_position: string;
  alignment: string;
  amount_of_turn: string;
  rise_and_fall: string;
}

interface RawFigure {
  dance: string;
  level: "student_teacher" | "associate" | "licentiate" | "fellow";
  figure_number: number;
  figure_name: string;
  variant_name: string | null;
  man: {
    steps: RawStep[];
    footwork: string;
    cbm: string;
    sway: string;
  };
  lady: {
    steps: RawStep[];
    footwork: string;
    cbm: string;
    sway: string;
  };
  timing: string;
  beat_value: string;
  notes: string[];
  precede: Record<string, string[]>;
  follow: Record<string, string[]>;
}

const DANCE_META: Record<
  string,
  { displayName: string; timeSignature: string; tempoDescription: string }
> = {
  waltz: {
    displayName: "Waltz",
    timeSignature: "3/4",
    tempoDescription: "30 bars per minute",
  },
  foxtrot: {
    displayName: "Foxtrot",
    timeSignature: "4/4",
    tempoDescription: "30 bars per minute",
  },
  quickstep: {
    displayName: "Quickstep",
    timeSignature: "4/4",
    tempoDescription: "50 bars per minute",
  },
  tango: {
    displayName: "Tango",
    timeSignature: "2/4",
    tempoDescription: "33 bars per minute",
  },
  "viennese-waltz": {
    displayName: "Viennese Waltz",
    timeSignature: "3/4",
    tempoDescription: "60 bars per minute",
  },
};

const LEVEL_ORDER: Record<string, number> = {
  student_teacher: 0,
  associate: 1,
  licentiate: 2,
  fellow: 3,
};

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const sql = neon(databaseUrl);
  const db = drizzle(sql, { schema });

  // Load extracted YAML files
  let files: string[];
  try {
    files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".yaml"));
  } catch {
    console.log("No extracted YAML files found in", DATA_DIR);
    console.log("Seeding with dance metadata only...");
    files = [];
  }

  // Insert dances
  console.log("Inserting dances...");
  const danceRecords: Record<string, number> = {};

  for (const [name, meta] of Object.entries(DANCE_META)) {
    const [dance] = await db
      .insert(schema.dances)
      .values({
        name,
        displayName: meta.displayName,
        timeSignature: meta.timeSignature,
        tempoDescription: meta.tempoDescription,
      })
      .onConflictDoNothing()
      .returning();
    if (dance) {
      danceRecords[name] = dance.id;
      console.log(`  Inserted dance: ${meta.displayName} (id=${dance.id})`);
    }
  }

  if (files.length === 0) {
    console.log("\nDone! Seeded dance metadata only.");
    console.log("Run the extraction script first to populate figures.");
    return;
  }

  // Parse all figures from YAML files
  const allFigures: RawFigure[] = [];
  for (const file of files) {
    const content = readFileSync(join(DATA_DIR, file), "utf-8");
    const figures = parse(content) as RawFigure[];
    if (Array.isArray(figures)) {
      allFigures.push(...figures);
    }
  }

  console.log(`\nParsed ${allFigures.length} figures from ${files.length} YAML files`);

  // Deduplicate figures by (dance, figure_number, variant_name)
  const figureMap = new Map<string, RawFigure>();
  for (const fig of allFigures) {
    const key = `${fig.dance}:${fig.figure_number}:${fig.variant_name ?? ""}`;
    const existing = figureMap.get(key);
    if (!existing || LEVEL_ORDER[fig.level] < LEVEL_ORDER[existing.level]) {
      figureMap.set(key, fig);
    }
  }

  console.log(`Deduplicated to ${figureMap.size} unique figures`);

  // Insert figures
  console.log("\nInserting figures...");
  const figureIdMap = new Map<string, number>(); // "dance:name:variant" -> db id

  for (const fig of figureMap.values()) {
    const danceId = danceRecords[fig.dance];
    if (!danceId) {
      console.warn(`  Unknown dance: ${fig.dance}, skipping figure ${fig.figure_name}`);
      continue;
    }

    const [inserted] = await db
      .insert(schema.figures)
      .values({
        danceId,
        figureNumber: fig.figure_number,
        name: fig.figure_name,
        variantName: fig.variant_name,
        level: fig.level,
        manSteps: fig.man?.steps ?? null,
        ladySteps: fig.lady?.steps ?? null,
        manFootwork: fig.man?.footwork ?? null,
        ladyFootwork: fig.lady?.footwork ?? null,
        manCbm: fig.man?.cbm ?? null,
        ladyCbm: fig.lady?.cbm ?? null,
        manSway: fig.man?.sway ?? null,
        ladySway: fig.lady?.sway ?? null,
        timing: fig.timing,
        beatValue: fig.beat_value,
        notes: fig.notes,
      })
      .returning();

    if (inserted) {
      const lookupKey = `${fig.dance}:${fig.figure_name}:${fig.variant_name ?? ""}`;
      figureIdMap.set(lookupKey, inserted.id);
    }
  }

  console.log(`Inserted ${figureIdMap.size} figures`);

  // Build edges from precede/follow data
  console.log("\nBuilding edges...");
  let edgeCount = 0;

  for (const fig of figureMap.values()) {
    const figKey = `${fig.dance}:${fig.figure_name}:${fig.variant_name ?? ""}`;
    const figId = figureIdMap.get(figKey);
    if (!figId) continue;

    // Process "follow" entries: this figure -> target
    if (fig.follow) {
      for (const [level, targets] of Object.entries(fig.follow)) {
        const edgeLevel = level as "associate" | "licentiate" | "fellow";
        if (!targets) continue;

        for (const targetName of targets) {
          // Try to find the target figure
          const targetKey = `${fig.dance}:${targetName}:`;
          const targetId = figureIdMap.get(targetKey);
          if (targetId) {
            await db
              .insert(schema.figureEdges)
              .values({
                sourceFigureId: figId,
                targetFigureId: targetId,
                level: edgeLevel,
              })
              .onConflictDoNothing();
            edgeCount++;
          }
        }
      }
    }
  }

  console.log(`Inserted ${edgeCount} edges`);
  console.log("\nDone!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
