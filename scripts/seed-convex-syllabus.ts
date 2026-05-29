/**
 * Convex syllabus seed — reads the YAML source of truth and imports it into
 * Convex through the internal `importSyllabus` mutation.
 *
 * Usage:
 *   pnpm tsx scripts/seed-convex-syllabus.ts --dry-run  # parse + report only
 *   pnpm tsx scripts/seed-convex-syllabus.ts            # import into Convex
 *
 * The non-dry-run path shells out to `npx convex run` once per dance, so the
 * active Convex deployment must already be configured (run `npx convex dev`
 * once first to write `.env.local`).
 *
 * Ported from `scripts/seed.ts` for the Convex migration
 * (docs/superpowers/plans/2026-05-22-convex-migration.md, Task 3). The OCR
 * extraction is intentionally unchanged — this preserves the current
 * syllabus data as the Convex test fixture.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");
const DATA_DIR = join(REPO_ROOT, "data");

export const MAX_UNMATCHED_EDGE_REFERENCES = 224;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SyllabusLevel =
  | "student_teacher"
  | "associate"
  | "licentiate"
  | "fellow";

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
  level: SyllabusLevel;
  figure_number: number;
  figure_name: string;
  variant_name: string | null;
  leader: RawPartner | null;
  follower: RawPartner | null;
  timing: string | null;
  beat_value: string | null;
  notes: string[] | null;
  precede: Record<string, string[]> | null;
  follow: Record<string, string[]> | null;
}

/** Payload shapes accepted by `convex/syllabus/import.ts:importSyllabus`. */
interface DancePayload {
  name: string;
  displayName: string;
  timeSignature?: string;
  tempoDescription?: string;
}

interface FigurePayload {
  danceName: string;
  figureNumber?: number;
  name: string;
  variantName?: string;
  level: SyllabusLevel;
  leaderSteps?: unknown;
  followerSteps?: unknown;
  leaderFootwork?: string;
  followerFootwork?: string;
  leaderCbm?: string;
  followerCbm?: string;
  leaderSway?: string;
  followerSway?: string;
  timing?: string;
  beatValue?: string;
  notes?: string[];
}

interface EdgePayload {
  danceName: string;
  sourceName: string;
  sourceVariantName?: string;
  targetName: string;
  targetVariantName?: string;
  level: SyllabusLevel;
  conditions?: string;
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

export function validateUnmatchedReferenceBudget(
  edgesUnmatched: number,
  maxAllowed = MAX_UNMATCHED_EDGE_REFERENCES,
): { ok: boolean; message: string } {
  if (edgesUnmatched > maxAllowed) {
    return {
      ok: false,
      message:
        `Unmatched references skipped (${edgesUnmatched}) exceed the ` +
        `accepted seed threshold (${maxAllowed}). Review the parser/data ` +
        `before importing so edge coverage does not regress silently.`,
    };
  }

  return {
    ok: true,
    message:
      `Unmatched reference threshold: ${edgesUnmatched}/${maxAllowed} ` +
      `skipped references (dry run fails above this accepted maximum).`,
  };
}

// ---------------------------------------------------------------------------
// Edge parsing helpers (ported verbatim from scripts/seed.ts)
// ---------------------------------------------------------------------------

function normalizeText(s: string): string {
  return s
    .replace(/[.,;:*]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expandAbbreviations(s: string): string {
  return s
    .replace(/\bto R\b/g, "to Right")
    .replace(/\bto L\b/g, "to Left")
    .replace(/\bChasse\b/g, "Chassé")
    .replace(/\bChasee\b/g, "Chassé")
    .replace(/\bCorte\b/g, "Corté");
}

function findFigure(
  text: string,
  knownNames: Set<string>,
): { figureName: string; conditions: string | null } | null {
  const cleaned = normalizeText(text);
  if (!cleaned) return null;

  const variants = [cleaned, expandAbbreviations(cleaned)];

  for (const candidate of variants) {
    if (knownNames.has(candidate)) {
      return { figureName: candidate, conditions: null };
    }
    const lower = candidate.toLowerCase();
    for (const name of knownNames) {
      if (name.toLowerCase() === lower) {
        return { figureName: name, conditions: null };
      }
    }
  }

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

  const lowerCleaned = cleaned.toLowerCase();
  const expandedLower = expandAbbreviations(cleaned).toLowerCase();
  let bestCompound: string | null = null;
  for (const name of knownNames) {
    const nameLower = name.toLowerCase();
    if (nameLower.length <= 3) continue;
    if (nameLower.endsWith(lowerCleaned) || nameLower.endsWith(expandedLower)) {
      if (!bestCompound || name.length < bestCompound.length) {
        bestCompound = name;
      }
    }
    if (
      nameLower.startsWith(lowerCleaned) ||
      nameLower.startsWith(expandedLower)
    ) {
      if (!bestCompound || name.length < bestCompound.length) {
        bestCompound = name;
      }
    }
  }
  if (bestCompound) {
    return { figureName: bestCompound, conditions: null };
  }

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
      cleaned.replace(
        new RegExp(bestMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
        "",
      ),
    );
    return { figureName: bestMatch, conditions: condition || null };
  }

  return null;
}

function parseEdgeEntries(
  raw: string[],
  knownNames: Set<string>,
): Array<{ figureName: string | null; conditions: string | null; raw: string }> {
  const results: Array<{
    figureName: string | null;
    conditions: string | null;
    raw: string;
  }> = [];

  for (const entry of raw) {
    const parts = entry.split(/\s*—\s*/);
    for (const part of parts) {
      const trimmed = normalizeText(part);
      if (!trimmed) continue;

      if (/^any\s+(natural|reverse)\s+figure$/i.test(trimmed)) {
        results.push({ figureName: null, conditions: trimmed, raw: trimmed });
        continue;
      }

      const match = findFigure(trimmed, knownNames);
      if (match) {
        results.push({
          figureName: match.figureName,
          conditions: match.conditions,
          raw: trimmed,
        });
      } else {
        results.push({ figureName: null, conditions: trimmed, raw: trimmed });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// YAML loading
// ---------------------------------------------------------------------------

function collectYamlFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "extracted") continue; // skip backup directory
    try {
      if (statSync(full).isDirectory()) {
        results.push(...collectYamlFiles(full));
      } else if (entry.endsWith(".yaml")) {
        results.push(full);
      }
    } catch {
      /* skip unreadable entries */
    }
  }
  return results;
}

function loadFigures(): RawFigure[] {
  const files = collectYamlFiles(DATA_DIR);
  const allRawFigures: RawFigure[] = [];
  for (const file of files) {
    const parsed = parse(readFileSync(file, "utf-8"));
    if (Array.isArray(parsed)) {
      allRawFigures.push(...(parsed as RawFigure[]));
    } else if (parsed && typeof parsed === "object") {
      allRawFigures.push(parsed as RawFigure);
    }
  }
  console.log(
    `Parsed ${allRawFigures.length} figure entries from ${files.length} YAML file(s)`,
  );

  // Deduplicate by (dance, figure_number, variant_name); keep the lowest level.
  const figureMap = new Map<string, RawFigure>();
  for (const fig of allRawFigures) {
    const key = `${fig.dance}:${fig.figure_number}:${fig.variant_name ?? ""}`;
    const existing = figureMap.get(key);
    if (!existing || LEVEL_ORDER[fig.level] < LEVEL_ORDER[existing.level]) {
      figureMap.set(key, fig);
    }
  }
  const figures = [...figureMap.values()];
  console.log(`Deduplicated to ${figures.length} unique figures`);
  return figures;
}

// ---------------------------------------------------------------------------
// Build the per-dance import payloads
// ---------------------------------------------------------------------------

type CanonicalFigure = { name: string; variantName: string | undefined };

interface DanceBundle {
  dance: DancePayload;
  figures: FigurePayload[];
  edges: EdgePayload[];
}

function toFigurePayload(fig: RawFigure): FigurePayload {
  return {
    danceName: fig.dance,
    figureNumber:
      typeof fig.figure_number === "number" ? fig.figure_number : undefined,
    name: fig.figure_name,
    variantName: fig.variant_name ?? undefined,
    level: fig.level,
    leaderSteps: fig.leader?.steps ?? undefined,
    followerSteps: fig.follower?.steps ?? undefined,
    leaderFootwork: fig.leader?.footwork ?? undefined,
    followerFootwork: fig.follower?.footwork ?? undefined,
    leaderCbm: fig.leader?.cbm ?? undefined,
    followerCbm: fig.follower?.cbm ?? undefined,
    leaderSway: fig.leader?.sway ?? undefined,
    followerSway: fig.follower?.sway ?? undefined,
    timing: fig.timing ?? undefined,
    beatValue: fig.beat_value ?? undefined,
    notes: fig.notes ?? undefined,
  };
}

function buildBundles(figures: RawFigure[]): {
  bundles: DanceBundle[];
  edgesUnmatched: number;
} {
  // Names usable for edge matching, per dance: base name + variant name.
  const figureNamesByDance = new Map<string, Set<string>>();
  // Resolve a matched name back to its canonical figure identity.
  const figureByName = new Map<string, CanonicalFigure>();

  for (const fig of figures) {
    if (!figureNamesByDance.has(fig.dance)) {
      figureNamesByDance.set(fig.dance, new Set());
    }
    const names = figureNamesByDance.get(fig.dance)!;
    names.add(fig.figure_name);
    if (fig.variant_name) names.add(fig.variant_name);

    const canonical: CanonicalFigure = {
      name: fig.figure_name,
      variantName: fig.variant_name ?? undefined,
    };
    const baseKey = `${fig.dance}:${fig.figure_name}`;
    if (!figureByName.has(baseKey)) figureByName.set(baseKey, canonical);
    if (fig.variant_name) {
      figureByName.set(`${fig.dance}:${fig.variant_name}`, canonical);
    }
  }

  const bundles = new Map<string, DanceBundle>();
  function bundleFor(dance: string): DanceBundle | null {
    const meta = DANCE_META[dance];
    if (!meta) {
      console.warn(`  Skipping unknown dance: ${dance}`);
      return null;
    }
    let bundle = bundles.get(dance);
    if (!bundle) {
      bundle = {
        dance: {
          name: dance,
          displayName: meta.displayName,
          timeSignature: meta.timeSignature,
          tempoDescription: meta.tempoDescription,
        },
        figures: [],
        edges: [],
      };
      bundles.set(dance, bundle);
    }
    return bundle;
  }

  for (const fig of figures) {
    bundleFor(fig.dance)?.figures.push(toFigurePayload(fig));
  }

  // Build directed edges from follow/precede references.
  let edgesUnmatched = 0;
  const seenEdges = new Set<string>();

  const edgeKey = (e: EdgePayload) =>
    [
      e.danceName,
      e.sourceName,
      e.sourceVariantName ?? "",
      e.targetName,
      e.targetVariantName ?? "",
      e.level,
      normalizeText(e.conditions ?? "").toLowerCase(),
    ].join("|");

  function addEdge(bundle: DanceBundle, edge: EdgePayload) {
    const key = edgeKey(edge);
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    bundle.edges.push(edge);
  }

  for (const fig of figures) {
    const bundle = bundleFor(fig.dance);
    if (!bundle) continue;
    const knownNames = figureNamesByDance.get(fig.dance) ?? new Set<string>();
    const source: CanonicalFigure = {
      name: fig.figure_name,
      variantName: fig.variant_name ?? undefined,
    };

    // "follow" entries: this figure -> target.
    for (const [level, targets] of Object.entries(fig.follow ?? {})) {
      if (!targets?.length) continue;
      if (!Object.prototype.hasOwnProperty.call(LEVEL_ORDER, level)) continue;
      const edgeLevel = level as SyllabusLevel;
      for (const entry of parseEdgeEntries(targets, knownNames)) {
        const target = entry.figureName
          ? figureByName.get(`${fig.dance}:${entry.figureName}`)
          : undefined;
        if (!target) {
          edgesUnmatched += 1;
          continue;
        }
        addEdge(bundle, {
          danceName: fig.dance,
          sourceName: source.name,
          sourceVariantName: source.variantName,
          targetName: target.name,
          targetVariantName: target.variantName,
          level: edgeLevel,
          conditions: entry.conditions
            ? normalizeText(entry.conditions)
            : undefined,
        });
      }
    }

    // "precede" entries: source <- this figure (reverse direction).
    for (const [level, sources] of Object.entries(fig.precede ?? {})) {
      if (!sources?.length) continue;
      if (!Object.prototype.hasOwnProperty.call(LEVEL_ORDER, level)) continue;
      const edgeLevel = level as SyllabusLevel;
      for (const entry of parseEdgeEntries(sources, knownNames)) {
        const precede = entry.figureName
          ? figureByName.get(`${fig.dance}:${entry.figureName}`)
          : undefined;
        if (!precede) {
          edgesUnmatched += 1;
          continue;
        }
        addEdge(bundle, {
          danceName: fig.dance,
          sourceName: precede.name,
          sourceVariantName: precede.variantName,
          targetName: source.name,
          targetVariantName: source.variantName,
          level: edgeLevel,
          conditions: entry.conditions
            ? normalizeText(entry.conditions)
            : undefined,
        });
      }
    }
  }

  return { bundles: [...bundles.values()], edgesUnmatched };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function main(argv = process.argv) {
  const dryRun = argv.includes("--dry-run");
  const figures = loadFigures();
  if (figures.length === 0) {
    console.log("No YAML files to seed from. Run extraction first.");
    return;
  }

  const { bundles, edgesUnmatched } = buildBundles(figures);

  const totalFigures = bundles.reduce((n, b) => n + b.figures.length, 0);
  const totalEdges = bundles.reduce((n, b) => n + b.edges.length, 0);

  console.log("\nWould import:");
  for (const bundle of bundles) {
    console.log(
      `  ${bundle.dance.name}: ${bundle.figures.length} figures, ` +
        `${bundle.edges.length} edges`,
    );
  }
  console.log(
    `\nDances: ${bundles.length}\n` +
      `Figures: ${totalFigures}\n` +
      `Edges: ${totalEdges} (unmatched references skipped: ${edgesUnmatched})`,
  );

  const unmatchedBudget = validateUnmatchedReferenceBudget(edgesUnmatched);
  console.log(unmatchedBudget.message);
  if (!unmatchedBudget.ok) {
    console.error(`\nERROR: ${unmatchedBudget.message}`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log("\n--- DRY RUN: no data written to Convex ---");
    return;
  }

  console.log("\nImporting into Convex (one mutation per dance)...");
  for (const bundle of bundles) {
    const payload = JSON.stringify({
      dances: [bundle.dance],
      figures: bundle.figures,
      edges: bundle.edges,
    });
    execFileSync(
      "npx",
      ["convex", "run", "syllabus/import:importSyllabus", payload],
      { cwd: REPO_ROOT, stdio: "inherit" },
    );
    console.log(`  ${bundle.dance.name}: imported`);
  }
  console.log("\nDone.");
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  main();
}
