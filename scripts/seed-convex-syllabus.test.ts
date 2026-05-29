// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_UNMATCHED_EDGE_REFERENCES,
  validateUnmatchedReferenceBudget,
} from "./seed-convex-syllabus";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, "..");

describe("Convex syllabus seed guardrails", () => {
  it("keeps the import mutation source free of literal NUL bytes", () => {
    const source = readFileSync(join(REPO_ROOT, "convex/syllabus/import.ts"));

    expect(source.indexOf(0)).toBe(-1);
  });

  it("reports and enforces the unmatched-reference threshold", () => {
    const withinBudget = validateUnmatchedReferenceBudget(
      MAX_UNMATCHED_EDGE_REFERENCES,
    );
    const overBudget = validateUnmatchedReferenceBudget(
      MAX_UNMATCHED_EDGE_REFERENCES + 1,
    );

    expect(withinBudget.ok).toBe(true);
    expect(withinBudget.message).toContain(
      `${MAX_UNMATCHED_EDGE_REFERENCES}/${MAX_UNMATCHED_EDGE_REFERENCES}`,
    );
    expect(overBudget.ok).toBe(false);
    expect(overBudget.message).toContain(
      `${MAX_UNMATCHED_EDGE_REFERENCES + 1}`,
    );
    expect(overBudget.message).toContain(`${MAX_UNMATCHED_EDGE_REFERENCES}`);
  });
});
