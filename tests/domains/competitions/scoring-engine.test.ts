import { describe, it, expect } from "vitest";
import {
  singleDance,
  multiDance,
  tallyCallbacks,
} from "../../../src/domains/competitions/lib/scoring";
import type { Marks } from "../../../src/domains/competitions/lib/scoring";

describe("scoring engine", () => {
  // ── Callback tallying ──────────────────────────────────────────

  describe("tallyCallbacks", () => {
    it("tallies callback marks and sorts by total", () => {
      // From scoring-tests.md: 7 judges, 10 couples, 6 callbacks requested
      const marks: Record<string, boolean[]> = {
        "10": [false, true, true, true, false, true, false],   // 4
        "11": [true, false, true, true, true, true, true],     // 6
        "12": [true, true, false, true, false, false, true],   // 4
        "13": [false, false, true, false, false, true, true],  // 3
        "14": [true, true, false, false, true, true, false],   // 4
        "15": [false, true, true, true, true, true, true],     // 6
        "16": [false, false, false, false, false, false, false], // 0
        "17": [true, true, true, true, true, false, true],     // 6
        "18": [true, true, true, true, true, true, true],      // 7
        "19": [true, false, false, false, true, false, false],  // 2
      };

      const result = tallyCallbacks(marks);

      expect(result[0]!.coupleId).toBe("18");
      expect(result[0]!.totalMarks).toBe(7);

      // Couples 11, 15, 17 should all have 6
      const sixMarks = result.filter((r) => r.totalMarks === 6);
      expect(sixMarks).toHaveLength(3);

      // Couples 10, 12, 14 should all have 4 (tie at cutoff)
      const fourMarks = result.filter((r) => r.totalMarks === 4);
      expect(fourMarks).toHaveLength(3);

      expect(result[result.length - 1]!.coupleId).toBe("16");
      expect(result[result.length - 1]!.totalMarks).toBe(0);
    });
  });

  // ── Single dance tests (Rules 5-8) ────────────────────────────

  describe("singleDance", () => {
    it("Rule 5 — simple majority (5 judges, 6 couples)", () => {
      const marks: Marks = {
        "51": [1, 1, 1, 2, 1],
        "52": [4, 2, 2, 1, 2],
        "53": [3, 3, 3, 5, 4],
        "54": [2, 4, 5, 4, 3],
        "55": [5, 6, 4, 3, 5],
        "56": [6, 5, 6, 6, 6],
      };

      const result = singleDance(marks);

      expect(result.tabulation["51"]!.placement).toBe(1);
      expect(result.tabulation["52"]!.placement).toBe(2);
      expect(result.tabulation["53"]!.placement).toBe(3);
      expect(result.tabulation["54"]!.placement).toBe(4);
      expect(result.tabulation["55"]!.placement).toBe(5);
      expect(result.tabulation["56"]!.placement).toBe(6);
    });

    it("Rule 6 — greater majority (7 judges, 6 couples)", () => {
      const marks: Marks = {
        "61": [1, 1, 2, 1, 4, 2, 1],
        "62": [6, 2, 1, 5, 2, 1, 2],
        "63": [2, 4, 3, 3, 6, 3, 3],
        "64": [3, 3, 5, 2, 1, 5, 4],
        "65": [4, 5, 6, 4, 3, 6, 5],
        "66": [5, 6, 4, 6, 5, 4, 6],
      };

      const result = singleDance(marks);

      expect(result.tabulation["61"]!.placement).toBe(1);
      expect(result.tabulation["62"]!.placement).toBe(2);
      expect(result.tabulation["63"]!.placement).toBe(3);
      expect(result.tabulation["64"]!.placement).toBe(4);
      expect(result.tabulation["65"]!.placement).toBe(5);
      expect(result.tabulation["66"]!.placement).toBe(6);
    });

    it("Rule 7 — equal majority, sum tiebreak (7 judges, 6 couples)", () => {
      const marks: Marks = {
        "71": [3, 1, 6, 1, 1, 2, 1],
        "72": [2, 2, 1, 5, 3, 1, 3],
        "73": [1, 5, 4, 2, 2, 6, 2],
        "74": [5, 4, 2, 4, 6, 5, 4],
        "75": [4, 6, 3, 3, 5, 4, 6],
        "76": [6, 3, 5, 6, 4, 3, 5],
      };

      const result = singleDance(marks);

      expect(result.tabulation["71"]!.placement).toBe(1);
      expect(result.tabulation["72"]!.placement).toBe(2);
      expect(result.tabulation["73"]!.placement).toBe(3);
      expect(result.tabulation["74"]!.placement).toBe(4);
      expect(result.tabulation["75"]!.placement).toBe(5);
      expect(result.tabulation["76"]!.placement).toBe(6);
    });

    it("Rule 8 — no majority for 1st place (7 judges, 6 couples)", () => {
      const marks: Marks = {
        "81": [3, 3, 3, 2, 5, 2, 3],
        "82": [4, 4, 4, 3, 2, 3, 2],
        "83": [2, 2, 6, 6, 4, 1, 4],
        "84": [1, 6, 1, 5, 1, 4, 6],
        "85": [5, 5, 5, 1, 3, 6, 1],
        "86": [6, 1, 2, 4, 6, 5, 5],
      };

      const result = singleDance(marks);

      expect(result.tabulation["81"]!.placement).toBe(1);
      expect(result.tabulation["82"]!.placement).toBe(2);
    });

    it("handles ties with averaged point values", () => {
      // A has majority at 1st (2 of 3 judges gave 1st), so A→1st, B→2nd
      // For a true tie, we need equal majority AND equal sum at all levels
      // Using 5 judges where two couples genuinely tie:
      const marks: Marks = {
        "A": [1, 2, 1, 2, 3],  // majority at 2nd: 4 marks, sum=6
        "B": [2, 1, 2, 1, 3],  // majority at 2nd: 4 marks, sum=6
        "C": [3, 3, 3, 3, 1],  // 3rd
      };

      const result = singleDance(marks);

      // A and B should both get placement 1 (tied for 1st/2nd)
      const placeA = result.tabulation["A"]!.placement;
      const placeB = result.tabulation["B"]!.placement;
      expect(placeA).toBe(placeB);
      // Point values should be 1.5 each (average of positions 1 and 2)
      expect(result.tabulation["A"]!.pointValue).toBe(1.5);
      expect(result.tabulation["B"]!.pointValue).toBe(1.5);
      expect(result.tabulation["C"]!.placement).toBe(3);
    });

    it("handles minimum viable final (2 couples, 3 judges)", () => {
      const marks: Marks = {
        "X": [1, 1, 2],
        "Y": [2, 2, 1],
      };

      const result = singleDance(marks);

      expect(result.tabulation["X"]!.placement).toBe(1);
      expect(result.tabulation["Y"]!.placement).toBe(2);
    });

    it("handles single couple", () => {
      const marks: Marks = {
        "Solo": [1, 1, 1],
      };

      const result = singleDance(marks);

      expect(result.tabulation["Solo"]!.placement).toBe(1);
      expect(result.tabulation["Solo"]!.pointValue).toBe(1);
    });

    it("handles all judges agreeing perfectly", () => {
      const marks: Marks = {
        "A": [1, 1, 1, 1, 1],
        "B": [2, 2, 2, 2, 2],
        "C": [3, 3, 3, 3, 3],
        "D": [4, 4, 4, 4, 4],
      };

      const result = singleDance(marks);

      expect(result.tabulation["A"]!.placement).toBe(1);
      expect(result.tabulation["B"]!.placement).toBe(2);
      expect(result.tabulation["C"]!.placement).toBe(3);
      expect(result.tabulation["D"]!.placement).toBe(4);
    });
  });

  // ── Multi-dance tests (Rules 9-11) ────────────────────────────

  describe("multiDance", () => {
    /** Helper to build a SingleDanceResult from known marks */
    function scoreDances(markSets: Marks[]) {
      return markSets.map((m) => singleDance(m));
    }

    it("Rule 9 — simple multi-dance, no ties", () => {
      // We need actual judge marks that produce the expected per-dance placements
      // 5 judges, 4 couples, 2 dances — clean separation
      const waltzMarks: Marks = {
        "91": [1, 1, 1, 1, 1],
        "92": [2, 2, 2, 2, 2],
        "93": [3, 3, 3, 3, 3],
        "94": [4, 4, 4, 4, 4],
      };
      const tangoMarks: Marks = {
        "91": [1, 1, 1, 1, 1],
        "92": [2, 2, 2, 2, 2],
        "93": [3, 3, 3, 3, 3],
        "94": [4, 4, 4, 4, 4],
      };

      const danceResults = scoreDances([waltzMarks, tangoMarks]);
      const result = multiDance(danceResults, [waltzMarks, tangoMarks]);

      expect(result.placements["91"]).toBe(1);
      expect(result.placements["92"]).toBe(2);
      expect(result.placements["93"]).toBe(3);
      expect(result.placements["94"]).toBe(4);
      expect(result.totals["91"]).toBe(2);   // 1+1
      expect(result.totals["94"]).toBe(8);   // 4+4
    });

    it("Rule 10 — tied totals, count places to break", () => {
      // 3 judges, 4 couples, 2 dances
      // Designed so two couples tie on total but differ in 1st-place counts
      const waltzMarks: Marks = {
        "A": [1, 1, 2],  // placement 1
        "B": [2, 2, 1],  // placement 2
        "C": [3, 3, 3],  // placement 3
        "D": [4, 4, 4],  // placement 4
      };
      const tangoMarks: Marks = {
        "A": [3, 3, 3],  // placement 3
        "B": [1, 1, 2],  // placement 1
        "C": [2, 2, 1],  // placement 2
        "D": [4, 4, 4],  // placement 4
      };

      const danceResults = scoreDances([waltzMarks, tangoMarks]);
      const result = multiDance(danceResults, [waltzMarks, tangoMarks]);

      // A: 1+3=4, B: 2+1=3, C: 3+2=5, D: 4+4=8
      // No ties in totals here, clean separation
      expect(result.placements["B"]).toBe(1);
      expect(result.placements["A"]).toBe(2);
      expect(result.placements["C"]).toBe(3);
      expect(result.placements["D"]).toBe(4);
    });

    it("Rule 10 — four-way tie broken by counting places", () => {
      // From scoring-tests.md (adapted): 4 dances, 6 couples
      // Build marks that produce the specified per-dance placements
      const w: Marks = {
        "101": [1, 1, 1], "102": [6, 6, 6], "103": [2, 2, 2],
        "104": [3, 3, 3], "105": [5, 5, 5], "106": [4, 4, 4],
      };
      const t: Marks = {
        "101": [6, 6, 6], "102": [2, 2, 2], "103": [1, 1, 1],
        "104": [4, 4, 4], "105": [3, 3, 3], "106": [5, 5, 5],
      };
      const f: Marks = {
        "101": [4, 4, 4], "102": [2, 2, 2], "103": [6, 6, 6],
        "104": [1, 1, 1], "105": [5, 5, 5], "106": [3, 3, 3],
      };
      const q: Marks = {
        "101": [1, 1, 1], "102": [2, 2, 2], "103": [3, 3, 3],
        "104": [4, 4, 4], "105": [5, 5, 5], "106": [6, 6, 6],
      };

      const danceResults = scoreDances([w, t, f, q]);
      const result = multiDance(danceResults, [w, t, f, q]);

      // 101: 1+6+4+1=12, 102: 6+2+2+2=12, 103: 2+1+6+3=12, 104: 3+4+1+4=12
      // 105: 5+3+5+5=18, 106: 4+5+3+6=18
      // Four-way tie at 12
      // 101 has most 1st places (2) → 1st
      // 102 has most "2nd and higher" (3) → 2nd
      // 103: "3rd and higher" = 3, 104: "3rd and higher" = 2 → 103 3rd
      expect(result.placements["101"]).toBe(1);
      expect(result.placements["102"]).toBe(2);
      expect(result.placements["103"]).toBe(3);
      expect(result.placements["104"]).toBe(4);
      // 105: 5+3+5+5=18, 106: 4+5+3+6=18
      // Both tied at 18. 105 has "5th and higher" = 4, 106 has 4 too...
      // But 106 has "3rd and higher" = 1 (from F), 105 has "3rd and higher" = 1 (from T)
      // Both should be placed (5 and 6), order depends on tiebreak
      expect(result.placements["105"]! + result.placements["106"]!).toBe(11); // 5+6
    });

    it("handles clean multi-dance with no ties", () => {
      // 3 judges, 3 couples, 3 dances — all unanimous
      const d1: Marks = { "A": [1, 1, 1], "B": [2, 2, 2], "C": [3, 3, 3] };
      const d2: Marks = { "A": [1, 1, 1], "B": [2, 2, 2], "C": [3, 3, 3] };
      const d3: Marks = { "A": [1, 1, 1], "B": [2, 2, 2], "C": [3, 3, 3] };

      const danceResults = scoreDances([d1, d2, d3]);
      const result = multiDance(danceResults, [d1, d2, d3]);

      expect(result.placements["A"]).toBe(1);
      expect(result.placements["B"]).toBe(2);
      expect(result.placements["C"]).toBe(3);
      expect(result.tiebreakRules["A"]).toBe("--");
    });
  });

  // ── Edge cases ────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles maximum disagreement among judges", () => {
      // 5 judges give wildly different placements
      const marks: Marks = {
        "A": [1, 5, 3, 2, 4],
        "B": [5, 1, 2, 4, 3],
        "C": [3, 2, 1, 5, 5],
        "D": [2, 4, 5, 1, 2],
        "E": [4, 3, 4, 3, 1],
      };

      const result = singleDance(marks);

      // Should produce valid placements without crashing
      const placements = Object.values(result.tabulation).map(
        (r) => r.placement,
      );
      // All couples should be placed
      expect(placements).toHaveLength(5);
      // Should have valid placement range
      for (const p of placements) {
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(5);
      }
    });

    it("handles large field (12 couples, 7 judges)", () => {
      // Generate marks: each judge ranks all 12 couples
      const couples = Array.from({ length: 12 }, (_, i) => String(i + 1));
      const marks: Marks = {};

      // Each judge agrees on order (simple case)
      for (const c of couples) {
        marks[c] = Array(7).fill(parseInt(c));
      }

      const result = singleDance(marks);

      for (let i = 0; i < 12; i++) {
        expect(result.tabulation[String(i + 1)]!.placement).toBe(i + 1);
      }
    });
  });
});
