/**
 * Database seed script — wipes and rebuilds from YAML source of truth.
 *
 * Usage:
 *   pnpm db:seed              # full wipe + reseed
 *   pnpm db:seed -- --dry-run # parse and report without writing to DB
 *
 * Reads all .yaml files from data/extracted/, inserts dances and figures,
 * then builds directed edges from precede/follow data.
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { parse } from "yaml";
import * as schema from "../src/db/schema";

const DATA_DIR = join(__dirname, "..", "data", "extracted");

const dryRun = process.argv.includes("--dry-run");

// ---------------------------------------------------------------------------
// Types for raw YAML
// ---------------------------------------------------------------------------

interface RawStep {
  step_number: number;
  feet_position: string;
  alignment: string;
  amount_of_turn: string;
  rise_and_fall: string;
}

interface RawPartner {
  steps: RawStep[] | null;
  footwork: string | null;
  cbm: string | null;
  sway: string | null;
  notes?: string | null;
}

interface RawFigure {
  _source_pdf_page: number;
  dance: string;
  level: "student_teacher" | "associate" | "licentiate" | "fellow";
  figure_number: number;
  figure_name: string;
  variant_name: string | null;
  man: RawPartner | null;
  lady: RawPartner | null;
  timing: string | null;
  beat_value: string | null;
  notes: string[] | null;
  precede: Record<string, string[]> | null;
  follow: Record<string, string[]> | null;
}

// ---------------------------------------------------------------------------
// Dance metadata
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Edge parsing helpers
// ---------------------------------------------------------------------------

/**
 * The YAML precede/follow entries are messy. A single entry might be:
 *   "LF Closed Change — Chassé from PP — Outside Change"
 *   "At corner — Natural Turn"
 *   "Any Reverse figure"
 *   "4-6 Natural Turn can be preceded by Reverse Corté"
 *
 * We split on " — " (spaced em-dash) to get individual items,
 * then try to match each to a known figure name. If there's a condition
 * prefix (like "At corner"), we extract it separately.
 */
function normalizeText(s: string): string {
  return s
    .replace(/[.,;:*]+$/, "")   // strip trailing punctuation
    .replace(/\s+/g, " ")       // collapse whitespace
    .trim();
}

/** Expand common abbreviations used in precede/follow references */
function expandAbbreviations(s: string): string {
  return s
    .replace(/\bto R\b/g, "to Right")
    .replace(/\bto L\b/g, "to Left")
    .replace(/\bChasse\b/g, "Chassé")
    .replace(/\bChasee\b/g, "Chassé")
    .replace(/\bCorte\b/g, "Corté");
}

/**
 * Build a lookup that tries multiple ways to match a string to a known
 * figure name: exact, case-insensitive, stripped punctuation, and
 * longest-substring match.
 */
function findFigure(
  text: string,
  knownNames: Set<string>
): { figureName: string; conditions: string | null } | null {
  const cleaned = normalizeText(text);
  if (!cleaned) return null;

  // Try matching with both original and abbreviation-expanded text
  const variants = [cleaned, expandAbbreviations(cleaned)];

  for (const candidate of variants) {
    // 1. Direct match
    if (knownNames.has(candidate)) {
      return { figureName: candidate, conditions: null };
    }

    // 2. Case-insensitive match
    const lower = candidate.toLowerCase();
    for (const name of knownNames) {
      if (name.toLowerCase() === lower) {
        return { figureName: name, conditions: null };
      }
    }
  }

  // 3. Condition prefix patterns — strip and retry
  const conditionPatterns = [
    /^at corner\s*/i,
    /^at a corner\s*/i,
    /^when facing \S+\s*/i,
    /^if ended \S+\s*/i,
    /^if commenced \S+\s*/i,
    /^approaching a corner\s*/i,
    /^progressing to corner\s*/i,
    /^at side of room\s*/i,
  ];
  for (const pattern of conditionPatterns) {
    const m = cleaned.match(pattern);
    if (m) {
      const remainder = normalizeText(cleaned.slice(m[0].length));
      const condition = normalizeText(m[0]);
      const expanded = expandAbbreviations(remainder);
      for (const r of [remainder, expanded]) {
        if (knownNames.has(r)) {
          return { figureName: r, conditions: condition };
        }
        for (const name of knownNames) {
          if (name.toLowerCase() === r.toLowerCase()) {
            return { figureName: name, conditions: condition };
          }
        }
      }
    }
  }

  // 4. Compound name matching — "Cross Hesitation" should match
  //    "Open Impetus and Cross Hesitation" or "Open Telemark and Cross Hesitation".
  //    Also handles "Open Telemark" matching "Open Telemark and Wing".
  //    We find the longest known name that STARTS WITH or ENDS WITH the candidate.
  const lowerCleaned = cleaned.toLowerCase();
  const expandedLower = expandAbbreviations(cleaned).toLowerCase();
  let bestCompound: string | null = null;
  for (const name of knownNames) {
    const nameLower = name.toLowerCase();
    if (nameLower.length <= 3) continue;
    // Check if the known name ends with this text (e.g., "...and Cross Hesitation")
    if (nameLower.endsWith(lowerCleaned) || nameLower.endsWith(expandedLower)) {
      if (!bestCompound || name.length < bestCompound.length) {
        bestCompound = name; // prefer shortest compound match
      }
    }
    // Check if the known name starts with this text (e.g., "Open Telemark and...")
    if (nameLower.startsWith(lowerCleaned) || nameLower.startsWith(expandedLower)) {
      if (!bestCompound || name.length < bestCompound.length) {
        bestCompound = name;
      }
    }
  }
  if (bestCompound) {
    return { figureName: bestCompound, conditions: null };
  }

  // 5. Longest known name that appears as a substring
  let bestMatch: string | null = null;
  for (const name of knownNames) {
    if (name.length <= 3) continue;
    if (cleaned.includes(name) || lowerCleaned.includes(name.toLowerCase())) {
      if (!bestMatch || name.length > bestMatch.length) {
        bestMatch = name;
      }
    }
  }
  if (bestMatch) {
    const condition = normalizeText(
      cleaned.replace(new RegExp(bestMatch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), "")
    );
    return {
      figureName: bestMatch,
      conditions: condition || null,
    };
  }

  return null;
}

function parseEdgeEntries(
  raw: string[],
  knownNames: Set<string>
): Array<{ figureName: string | null; conditions: string | null; raw: string }> {
  const results: Array<{
    figureName: string | null;
    conditions: string | null;
    raw: string;
  }> = [];

  for (const entry of raw) {
    // Split on " — " (em-dash with spaces) which the book uses as a list separator
    const parts = entry.split(/\s*—\s*/);

    for (const part of parts) {
      const trimmed = normalizeText(part);
      if (!trimmed) continue;

      // Skip pure generic references — these can't map to a single figure
      if (/^any\s+(natural|reverse)\s+figure$/i.test(trimmed)) {
        // Still record it so the data isn't lost, but mark figureName null
        results.push({ figureName: null, conditions: trimmed, raw: trimmed });
        continue;
      }

      const match = findFigure(trimmed, knownNames);
      if (match) {
        results.push({ figureName: match.figureName, conditions: match.conditions, raw: trimmed });
      } else {
        results.push({ figureName: null, conditions: trimmed, raw: trimmed });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const neonSql = neon(databaseUrl);
  const db = drizzle(neonSql, { schema });

  // Load YAML files
  let files: string[];
  try {
    files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".yaml"));
  } catch {
    console.log("No extracted YAML files found in", DATA_DIR);
    files = [];
  }

  if (files.length === 0) {
    console.log("No YAML files to seed from. Run extraction first.");
    return;
  }

  // Parse all figures
  const allRawFigures: RawFigure[] = [];
  for (const file of files) {
    const content = readFileSync(join(DATA_DIR, file), "utf-8");
    const parsed = parse(content) as RawFigure[];
    if (Array.isArray(parsed)) {
      allRawFigures.push(...parsed);
    }
  }

  console.log(
    `Parsed ${allRawFigures.length} figure entries from ${files.length} YAML file(s)`
  );

  // Deduplicate by (dance, figure_number, variant_name)
  // Keep the entry with the lowest level when duplicates exist
  const figureMap = new Map<string, RawFigure>();
  for (const fig of allRawFigures) {
    const key = `${fig.dance}:${fig.figure_number}:${fig.variant_name ?? ""}`;
    const existing = figureMap.get(key);
    if (
      !existing ||
      LEVEL_ORDER[fig.level] < LEVEL_ORDER[existing.level]
    ) {
      figureMap.set(key, fig);
    }
  }

  const figures = [...figureMap.values()];
  console.log(`Deduplicated to ${figures.length} unique figures`);

  // Report per-dance counts
  const danceCounts: Record<string, number> = {};
  for (const fig of figures) {
    danceCounts[fig.dance] = (danceCounts[fig.dance] ?? 0) + 1;
  }
  console.log("\nFigures per dance:");
  for (const [dance, count] of Object.entries(danceCounts).sort()) {
    console.log(`  ${dance}: ${count}`);
  }

  if (dryRun) {
    console.log("\n--- DRY RUN: skipping database writes ---");
    reportEdgeMatching(figures);
    return;
  }

  // =========================================================================
  // WIPE — truncate all tables and reset sequences
  // =========================================================================
  console.log("\nWiping existing data...");
  await neonSql`TRUNCATE figure_notes, routine_entries, routines, figure_edges, figures, dances RESTART IDENTITY CASCADE`;

  // =========================================================================
  // INSERT DANCES
  // =========================================================================
  console.log("\nInserting dances...");
  const danceIdByName: Record<string, number> = {};

  for (const [name, meta] of Object.entries(DANCE_META)) {
    const [dance] = await db
      .insert(schema.dances)
      .values({
        name,
        displayName: meta.displayName,
        timeSignature: meta.timeSignature,
        tempoDescription: meta.tempoDescription,
      })
      .returning();
    danceIdByName[name] = dance.id;
    console.log(`  ${meta.displayName} (id=${dance.id})`);
  }

  // =========================================================================
  // INSERT FIGURES
  // =========================================================================
  console.log("\nInserting figures...");

  // Map from "dance:figureName:variantName" -> DB id
  const figureIdMap = new Map<string, number>();
  // Also track all figure names per dance for edge matching
  const figureNamesByDance = new Map<string, Set<string>>();

  for (const fig of figures) {
    const danceId = danceIdByName[fig.dance];
    if (!danceId) {
      console.warn(`  Skipping unknown dance: ${fig.dance}`);
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

    // Register multiple lookup keys so edge matching can find this figure
    // by its base name, variant name, or full key
    const fullKey = `${fig.dance}:${fig.figure_name}:${fig.variant_name ?? ""}`;
    figureIdMap.set(fullKey, inserted.id);
    // Also register by just the base name (if no variant, or as fallback)
    const baseKey = `${fig.dance}:${fig.figure_name}`;
    if (!figureIdMap.has(baseKey)) {
      figureIdMap.set(baseKey, inserted.id);
    }
    // Register by variant name too (e.g., "waltz:RF Closed Change")
    if (fig.variant_name) {
      const variantKey = `${fig.dance}:${fig.variant_name}`;
      figureIdMap.set(variantKey, inserted.id);
    }

    // Track names for edge matching (both base name and variant)
    if (!figureNamesByDance.has(fig.dance)) {
      figureNamesByDance.set(fig.dance, new Set());
    }
    const names = figureNamesByDance.get(fig.dance)!;
    names.add(fig.figure_name);
    if (fig.variant_name) {
      names.add(fig.variant_name);
    }
  }

  console.log(`  Inserted ${figureIdMap.size} figures`);

  // =========================================================================
  // BUILD EDGES
  // =========================================================================
  console.log("\nBuilding edges...");

  let edgesInserted = 0;
  let edgesUnmatched = 0;
  const unmatchedExamples: string[] = [];

  for (const fig of figures) {
    const figKey = `${fig.dance}:${fig.figure_name}:${fig.variant_name ?? ""}`;
    const sourceId = figureIdMap.get(figKey);
    if (!sourceId) continue;

    const knownNames = figureNamesByDance.get(fig.dance) ?? new Set();

    // Process "follow" entries: source -> target
    if (fig.follow) {
      for (const [level, targets] of Object.entries(fig.follow)) {
        if (!targets?.length) continue;
        const edgeLevel = level as "associate" | "licentiate" | "fellow";
        if (!LEVEL_ORDER.hasOwnProperty(edgeLevel)) continue;

        const parsed = parseEdgeEntries(targets, knownNames);
        for (const entry of parsed) {
          if (!entry.figureName) {
            edgesUnmatched++;
            if (unmatchedExamples.length < 20) {
              unmatchedExamples.push(
                `  [follow] ${fig.figure_name} -> "${entry.raw}" (${fig.dance}/${level})`
              );
            }
            continue;
          }

          // Find the target figure's DB id
          const targetId = figureIdMap.get(`${fig.dance}:${entry.figureName}`);
          if (!targetId) {
            edgesUnmatched++;
            if (unmatchedExamples.length < 20) {
              unmatchedExamples.push(
                `  [follow] ${fig.figure_name} -> "${entry.figureName}" (${fig.dance}/${level}) — name matched but no DB record`
              );
            }
            continue;
          }

          await db.insert(schema.figureEdges).values({
            sourceFigureId: sourceId,
            targetFigureId: targetId,
            level: edgeLevel,
            conditions: entry.conditions,
          });
          edgesInserted++;
        }
      }
    }

    // Process "precede" entries: source <- target (reverse direction)
    if (fig.precede) {
      for (const [level, sources] of Object.entries(fig.precede)) {
        if (!sources?.length) continue;
        const edgeLevel = level as "associate" | "licentiate" | "fellow";
        if (!LEVEL_ORDER.hasOwnProperty(edgeLevel)) continue;

        const parsed = parseEdgeEntries(sources, knownNames);
        for (const entry of parsed) {
          if (!entry.figureName) {
            edgesUnmatched++;
            if (unmatchedExamples.length < 20) {
              unmatchedExamples.push(
                `  [precede] "${entry.raw}" -> ${fig.figure_name} (${fig.dance}/${level})`
              );
            }
            continue;
          }

          const precedeId = figureIdMap.get(`${fig.dance}:${entry.figureName}`);
          if (!precedeId) {
            edgesUnmatched++;
            if (unmatchedExamples.length < 20) {
              unmatchedExamples.push(
                `  [precede] "${entry.figureName}" -> ${fig.figure_name} (${fig.dance}/${level}) — name matched but no DB record`
              );
            }
            continue;
          }

          await db.insert(schema.figureEdges).values({
            sourceFigureId: precedeId,
            targetFigureId: sourceId,
            level: edgeLevel,
            conditions: entry.conditions,
          });
          edgesInserted++;
        }
      }
    }
  }

  console.log(`  Inserted ${edgesInserted} edges`);
  console.log(`  Unmatched: ${edgesUnmatched}`);
  if (unmatchedExamples.length > 0) {
    console.log("\n  Sample unmatched edges:");
    for (const ex of unmatchedExamples) {
      console.log(ex);
    }
  }

  console.log("\nDone!");
}

// ---------------------------------------------------------------------------
// Dry-run edge report
// ---------------------------------------------------------------------------

function reportEdgeMatching(figures: RawFigure[]) {
  const figureNamesByDance = new Map<string, Set<string>>();
  for (const fig of figures) {
    if (!figureNamesByDance.has(fig.dance)) {
      figureNamesByDance.set(fig.dance, new Set());
    }
    const names = figureNamesByDance.get(fig.dance)!;
    names.add(fig.figure_name);
    if (fig.variant_name) names.add(fig.variant_name);
  }

  let matched = 0;
  let unmatched = 0;
  const unmatchedExamples: string[] = [];

  for (const fig of figures) {
    const knownNames = figureNamesByDance.get(fig.dance) ?? new Set();

    for (const direction of ["follow", "precede"] as const) {
      const data = fig[direction];
      if (!data) continue;

      for (const [level, entries] of Object.entries(data)) {
        if (!entries?.length) continue;
        const parsed = parseEdgeEntries(entries, knownNames);
        for (const entry of parsed) {
          if (entry.figureName) {
            matched++;
          } else {
            unmatched++;
            if (unmatchedExamples.length < 30) {
              unmatchedExamples.push(
                `  [${direction}] ${fig.figure_name} <-> "${entry.raw}" (${fig.dance}/${level})`
              );
            }
          }
        }
      }
    }
  }

  console.log(`\nEdge matching report:`);
  console.log(`  Matched: ${matched}`);
  console.log(`  Unmatched: ${unmatched}`);
  console.log(
    `  Match rate: ${((matched / (matched + unmatched)) * 100).toFixed(1)}%`
  );
  if (unmatchedExamples.length > 0) {
    console.log(`\n  Unmatched examples:`);
    for (const ex of unmatchedExamples) {
      console.log(ex);
    }
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
