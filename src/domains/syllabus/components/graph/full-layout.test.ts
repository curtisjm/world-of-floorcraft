import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFullGraphLayout } from "./full-layout";

describe("computeFullGraphLayout", () => {
  it("keeps directed chains flowing top-to-bottom", () => {
    const positioned = computeFullGraphLayout(
      [{ id: "1" }, { id: "2" }, { id: "3" }],
      [
        { source: "1", target: "2" },
        { source: "2", target: "3" },
      ]
    );

    const byId = new Map(positioned.map((node) => [node.id, node]));
    assert.ok(byId.has("1"));
    assert.ok(byId.has("2"));
    assert.ok(byId.has("3"));
    assert.ok(byId.get("2")!.position.y > byId.get("1")!.position.y);
    assert.ok(byId.get("3")!.position.y > byId.get("2")!.position.y);
  });

  it("returns disconnected nodes with finite positions", () => {
    const positioned = computeFullGraphLayout(
      [{ id: "a" }, { id: "b" }, { id: "c" }],
      []
    );

    assert.equal(positioned.length, 3);
    for (const node of positioned) {
      assert.equal(Number.isFinite(node.position.x), true);
      assert.equal(Number.isFinite(node.position.y), true);
    }
  });
});
