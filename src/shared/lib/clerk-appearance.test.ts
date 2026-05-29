import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import { fileURLToPath } from "node:url";
import { shadcn } from "@clerk/ui/themes";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

describe("clerkAppearance", () => {
  it("exports a shared auth appearance config with shadcn theme", async () => {
    const mod = await import("./clerk-appearance").catch(() => null);
    assert.ok(mod?.clerkAppearance, "expected a shared `clerkAppearance` export");
    assert.equal(mod?.clerkAppearance.theme, shadcn);
    assert.equal(mod?.clerkAppearance.cssLayerName, "clerk");
    assert.equal(mod?.clerkAppearance.variables?.colorBackground, "var(--card)");
    assert.equal(mod?.clerkAppearance.variables?.colorPrimary, "var(--primary)");
  });

  it("enables a dedicated Clerk CSS layer in global styles", async () => {
    const globalsCssPath = path.resolve(currentDir, "../../app/globals.css");
    const globalsCss = await readFile(globalsCssPath, "utf8");
    assert.match(globalsCss, /@layer theme, base, clerk, components, utilities;/);
    assert.match(globalsCss, /@layer clerk/);
  });

  it("wires the shared appearance config into ClerkProvider", async () => {
    const layoutPath = path.resolve(currentDir, "../../app/layout.tsx");
    const layoutSource = await readFile(layoutPath, "utf8");
    assert.match(
      layoutSource,
      /import\s+\{\s*clerkAppearance\s*\}\s+from\s+"@shared\/lib\/clerk-appearance"/
    );
    assert.match(layoutSource, /<ClerkProvider\s+appearance=\{clerkAppearance\}>/);
  });
});
