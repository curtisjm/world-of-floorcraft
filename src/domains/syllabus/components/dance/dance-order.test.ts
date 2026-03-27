import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sortDancesForBrowse } from "./dance-order";

describe("sortDancesForBrowse", () => {
  it("orders dance cards for the browse page", () => {
    const dances = [
      { id: 1, name: "quickstep", displayName: "Quickstep", timeSignature: "4/4" },
      { id: 2, name: "foxtrot", displayName: "Foxtrot", timeSignature: "4/4" },
      { id: 3, name: "tango", displayName: "Tango", timeSignature: "2/4" },
      { id: 4, name: "waltz", displayName: "Waltz", timeSignature: "3/4" },
      { id: 5, name: "viennese-waltz", displayName: "Viennese Waltz", timeSignature: "3/4" },
    ];

    const orderedNames = sortDancesForBrowse(dances).map((dance) => dance.name);

    assert.deepEqual(orderedNames, [
      "waltz",
      "tango",
      "viennese-waltz",
      "foxtrot",
      "quickstep",
    ]);
  });
});
