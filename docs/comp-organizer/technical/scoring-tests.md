# Scoring Engine Test Data

Test cases extracted from `skating-system.pdf`. Additional real-world test data to be added from competition results websites.

---

## Preliminary Round Tests (Rule 1)

### Test: Callback tallying with tie at cutoff
- 7 judges (A-G), 10 couples (10-19), 6 callbacks requested
- Input marks (X = callback):

| No | A | B | C | D | E | F | G | Expected Total |
|----|---|---|---|---|---|---|---|----------------|
| 10 |   | X | X | X |   | X |   | 4* |
| 11 | X |   | X | X | X | X | X | 6 |
| 12 | X | X |   | X |   |   | X | 4* |
| 13 |   |   | X |   |   | X | X | 3 |
| 14 | X | X |   |   | X | X |   | 4* |
| 15 |   | X | X | X | X | X | X | 6 |
| 16 |   |   |   |   |   |   |   | 0 |
| 17 | X | X | X | X | X |   | X | 6 |
| 18 | X | X | X | X | X | X | X | 7 |
| 19 | X |   |   |   | X |   |   | 2 |

- Expected: Couples 11, 15, 17, 18 advance clearly (6+ marks)
- Tie at cutoff: Couples 10, 12, 14 all have 4 marks — cannot recall exactly 6, must recall 4 or 7
- System should flag this tie for scrutineer/chairman to resolve

---

## Single Dance Tests (Rules 5-8)

### Test: Rule 5 — Simple majority (5 judges, 6 couples)

Waltz, 5 judges (A-E):

| No | A | B | C | D | E |
|----|---|---|---|---|---|
| 51 | 1 | 1 | 1 | 2 | 1 |
| 52 | 4 | 2 | 2 | 1 | 2 |
| 53 | 3 | 3 | 3 | 5 | 4 |
| 54 | 2 | 4 | 5 | 4 | 3 |
| 55 | 5 | 6 | 4 | 3 | 5 |
| 56 | 6 | 5 | 6 | 6 | 6 |

Expected results: 51→1st, 52→2nd, 53→3rd, 54→4th, 55→5th, 56→6th

Expected tabulation for couple 51: `[4, --, --, --, --, --, --, --]` → Place 1
Expected tabulation for couple 52: `[1, 4, --, --, --, --, --, --]` → Place 2

### Test: Rule 6 — Greater majority (7 judges, 6 couples)

Waltz, 7 judges (A-G):

| No | A | B | C | D | E | F | G |
|----|---|---|---|---|---|---|---|
| 61 | 1 | 1 | 2 | 1 | 4 | 2 | 1 |
| 62 | 6 | 2 | 1 | 5 | 2 | 1 | 2 |
| 63 | 2 | 4 | 3 | 3 | 6 | 3 | 3 |
| 64 | 3 | 3 | 5 | 2 | 1 | 5 | 4 |
| 65 | 4 | 5 | 6 | 4 | 3 | 6 | 5 |
| 66 | 5 | 6 | 4 | 6 | 5 | 4 | 6 |

Expected results: 61→1st, 62→2nd, 63→3rd, 64→4th, 65→5th, 66→6th

Key points:
- 1st and 2nd placed by simple majority (Rule 5)
- 3rd and 4th: both #63 and #64 have majority at "3rd and higher" — #63 has greater majority (5 vs 4), so #63 gets 3rd (Rule 6)
- 5th: neither #65 nor #66 has majority at "4th and higher", move to "5th and higher" — #65 has 5, #66 has 4 → #65 gets 5th (Rule 6)

### Test: Rule 7 — Equal majority, sum tiebreak (7 judges, 6 couples)

Waltz, 7 judges (A-G):

| No | A | B | C | D | E | F | G |
|----|---|---|---|---|---|---|---|
| 71 | 3 | 1 | 6 | 1 | 1 | 2 | 1 |
| 72 | 2 | 2 | 1 | 5 | 3 | 1 | 3 |
| 73 | 1 | 5 | 4 | 2 | 2 | 6 | 2 |
| 74 | 5 | 4 | 2 | 4 | 6 | 5 | 4 |
| 75 | 4 | 6 | 3 | 3 | 5 | 4 | 6 |
| 76 | 6 | 3 | 5 | 6 | 4 | 3 | 5 |

Expected results: 71→1st, 72→2nd, 73→3rd, 74→4th, 75→5th, 76→6th

Key points:
- 1st: #71 by simple majority of 1st place marks
- 2nd: #72 and #73 both have 4 "2nd and higher" marks (equal majority). Sum: #72 = 2+2+1+1 = 6, #73 = 1+2+2+2 = 7. Lower sum wins → #72 gets 2nd (Rule 7)
- 4th and 5th: #74 and #75 equal majority at "4th and higher" (4 each), equal sum (14 each). Move to "5th and higher" column. #74 has majority of 6, #75 has majority of 5. #74 gets 4th by greater majority (back to Rule 6)
- 6th: #76 gets "5th and higher" count of 5, awarded 6th

### Test: Rule 7 — Unbreakable tie
When two couples have equal majority AND equal sum through ALL columns, they receive the averaged position. E.g. tied for 3rd and 4th → both get 3.5 (announced as tied for 3rd).

### Test: Rule 8 — No majority for 1st place (7 judges, 6 couples)

Waltz, 7 judges (A-G):

| No | A | B | C | D | E | F | G |
|----|---|---|---|---|---|---|---|
| 81 | 3 | 3 | 3 | 2 | 5 | 2 | 3 |
| 82 | 4 | 4 | 4 | 3 | 2 | 3 | 2 |
| 83 | 2 | 2 | 6 | 6 | 4 | 1 | 4 |
| 84 | 1 | 6 | 1 | 5 | 1 | 4 | 6 |
| 85 | 5 | 5 | 5 | 1 | 3 | 6 | 1 |
| 86 | 6 | 1 | 2 | 4 | 6 | 5 | 5 |

Expected results: 81→1st, 82→2nd, 83→3rd, 84→4th, 85→5th, 86→6th

Key points:
- No couple has majority of 1st place marks
- No couple has majority of "2nd and higher" marks either
- At "3rd and higher": #81 has 6, #82 has 4 → both have majority. Rule 6: #81 has greater majority → 1st place, #82 → 2nd
- At "4th and higher": #83 has 4, #84 has 4 → both have majority. Rule 6: equal. Then continue applying rules to remaining couples.

---

## Multi-Dance Tests (Rules 9-11)

### Test: Rule 9 — Simple multi-dance, no ties (5 dances, 8 couples)

Final Summary (per-dance placements already computed):

| No | W | T | V | F | Q | Total | Expected Result |
|----|---|---|---|---|---|-------|-----------------|
| 91 | 1 | 1 | 1 | 1 | 1 | 5 | 1 |
| 92 | 4 | 2 | 2 | 2 | 2 | 12 | 2 |
| 93 | 2 | 3 | 3 | 3 | 3 | 14 | 3 |
| 94 | 5 | 5 | 6 | 4 | 5 | 25 | 4 |
| 95 | 3 | 4 | 5 | 7 | 7 | 26 | 5 |
| 96 | 6 | 7 | 4 | 5 | 6 | 28 | 6 |
| 97 | 7 | 6 | 7 | 6 | 4 | 30 | 7 |
| 98 | 8 | 8 | 8 | 8 | 8 | 40 | 8 |

### Test: Rule 10 — Tied totals, count places to break (3 dances, 6 couples)

Final Summary:

| No | W | T | F | Total | Expected Result |
|----|---|---|---|-------|-----------------|
| 101 | 1 | 1 | 3 | 5 | 1 |
| 102 | 2 | 2 | 1 | 5 | 2 |
| 103 | 6 | 4 | 2 | 12 | 3 |
| 104 | 5 | 3 | 4 | 12 | 4 |
| 105 | 4 | 5 | 5 | 14 | 5 |
| 106 | 3 | 6 | 6 | 15 | 6 |

Key points:
- #101 and #102 tied at 5: #101 has 2 first places, #102 has 1 → #101 wins (Rule 10, count 1st places)
- #103 and #104 tied at 12: count "1st and higher" — neither has any. Count "2nd and higher" — #102 has 1, #103 has 0... wait, need to re-examine. #103 has zero 1st places and one 2nd place; #104 has zero 1st places and zero 2nd places but one 3rd place. #103 has more "2nd and higher" → #103 gets 3rd.

### Test: Rule 10 — Four-way tie (4 dances, 6 couples)

Final Summary:

| No | W | T | F | Q | Total | Expected Result |
|----|---|---|---|---|-------|-----------------|
| 101 | 1 | 6 | 4 | 1 | 12 | 1 |
| 102 | 6 | 2 | 2 | 2 | 12 | 2 |
| 103 | 2 | 1 | 6 | 3 | 12 | 3 |
| 104 | 3 | 4 | 1 | 4 | 12 | 4 |
| 105 | 5 | 3 | 5 | 5 | 18 | 5 |
| 106 | 4 | 5 | 3 | 6 | 18 | 6 |

Key points:
- Four couples (#101-104) tied at 12. Apply Rule 10 repeatedly, one at a time.
- #101 has most 1st places (2) → placed 1st
- Remaining three tied for 2nd: count "2nd and higher" — #102 has 3, others have less → #102 placed 2nd
- #103 and #104 for 3rd: count "3rd and higher" — #103 has 3, #104 has 2 → #103 placed 3rd
- #104 is last remaining → 4th
- #105 and #106 tied at 18: count "5th and higher" — #105 has 4, #106 has 3 → #105 placed 5th

### Test: Rule 10 with fractional placements

When per-dance placements include fractions (e.g. 2.5 from a single-dance tie), Rule 10 rounds them: 2.5 is treated as "3rd and higher" for counting purposes. But when summing, use the actual fractional value.

### Test: Rule 11 — Smush all marks into single dance (5 dances, 7 couples)

Final Summary:

| No | W | T | V | F | Q | Total | Expected Result |
|----|---|---|---|---|---|-------|-----------------|
| 102 | 1 | 3 | 2 | 1 | 1 | 8 | 1 |
| 107 | 2 | 1 | 1 | 2 | 2 | 8 | 2 |
| 105 | 4 | 4 | 3 | 3 | 3 | 17 | 3 |
| 106 | 3 | 2 | 4 | 4 | 4 | 17 | 4 |
| 101 | 7 | 6 | 5 | 6 | 5 | 29 | R11 |
| 103 | 5 | 5 | 6 | 7 | 6 | 29 | R11 |
| 104 | 6 | 7 | 7 | 5 | 7 | 32 | 7 |

Key points:
- #102 and #107 tied at 8: #102 has more 1st places (3 vs 2) → #102 placed 1st (Rule 10)
- #105 and #106 tied at 17: count "3rd and higher" — #105 has 3, #106 has 2 → #105 placed 3rd (Rule 10)
- #101 and #103 tied at 29: Rule 10 fails to break tie → apply Rule 11
  - Smush all marks from all dances into one set
  - Apply Rules 5-8 to smushed marks to determine winner
  - If Rule 11 also fails → tie stands

### Test: Final Example from PDF — Full multi-dance with all rules (2 dances, 8 couples, 5 judges)

**Foxtrot** marks (5 judges A, B, C/D combined, E, F/G combined):

| No | A | B | C | D | E | F | G |
|----|---|---|---|---|---|---|---|
| 111 | 2 | 5 | 6 | 4 |   | — | 1 | 1 | 2 | 3(11) |  |  |  | → Place 4 |
| 112 | 6 | 8 | 1 | 5 | 7 |   | 1 | 1 | 1 | 2 | 3 |  |  | → Place 6 |
| 113 | 8 | 3 | 2 | 8 | 8 |   | — | 1 | 2 | 2 | 2 | 2 | 5 | → Place 8 |
| 114 | 7 | 4 | 3 | 3 | 2 |   | — | 1 | 3 | — |  |  |  | → Place 3 |
| 115 | 1 | 1 | 5 | 2 | 6 |   | 2 | 3(4) | 3(4) |  |  |  |  | → Place 2 |
| 116 | 4 | 2 | 4 | 1 | 1 |   | 2 | 3(4) | 3(4) |  |  |  |  | → Place 1 |
| 117 | 5 | 7 | 8 | 7 | 3 |   | — | — | 1 | 1 | 2 | 2 | 4 | → Place 7 |
| 118 | 3 | 6 | 7 | 4 | 5 |   | — | — | 1 | 2 | 3(12) |  |  | → Place 5 |

**Tango** marks:

| No | A | B | C | D | E | F | G |
|----|---|---|---|---|---|---|---|
| 111 | 3 | 6 | 5 | 4 |   | — | — | 1 | 2 | 4 |  |  |  | → Place 5 |
| 112 | 7 | 8 | 3 | 8 | 7 |   | — | — | 1 | 1 | 1 | 3 |  | → Place 8 |
| 113 | 8 | 5 | 4 | 6 | 8 |   | — | — | — | 1 | 2 | 3 |  | → Place 6 |
| 114 | 6 | 3 | 1 | 3 | 3 |   | 1 | 1 | 4 | — |  |  |  | → Place 3 |
| 115 | 1 | 1 | 2 | 4 | 5 |   | 2 | 3(4) | — |  |  |  |  | → Place 1 |
| 116 | 4 | 2 | 6 | 2 | 2 |   | — | 3(6) | — |  |  |  |  | → Place 2 |
| 117 | 2 | 7 | 7 | 7 | 1 |   | 1 | 2 | 2 | 2 | 2 | 5 |  | → Place 7 |
| 118 | 5 | 4 | 8 | 1 | 6 |   | 1 | 1 | 1 | 3 | — |  |  | → Place 4 |

**Final Summary:**

| No | F | T | Total | Expected Result |
|----|---|---|-------|-----------------|
| 111 | 4 | 5 | 9 | 4 |
| 112 | 6 | 8 | 14 | 6 |
| 113 | 8 | 6 | 14 | 7 |
| 114 | 3 | 3 | 6 | 3 |
| 115 | 2 | 1 | 3 | 1 |
| 116 | 1 | 2 | 3 | 2 |
| 117 | 7 | 7 | 14 | 8 |
| 118 | 5 | 4 | 9 | 5 |

**Ties to resolve:**
- #115 and #116 tied at 3: #115 has 1 first place, #116 has 1 first place → tied. Count "2nd and higher": both have 2. Sum at "2nd and higher": #115 = 1+2 = 3, #116 = 1+2 = 3. → Rule 11 needed.
  - Rule 11: smush all marks, apply Rules 5-8. #115 wins → 1st, #116 → 2nd
- #112, #113, #117 tied at 14: count 6th places — #112 has 1, #113 has 1, #117 has 0... apply Rule 10 iteratively.
- #111 and #118 tied at 9: count "4th and higher" — #111 has 1, #118 has 1... apply Rule 10.

---

## Edge Case Tests

### Test: Minimum viable final (2 couples, 3 judges)
Simplest possible final — should produce clear 1st and 2nd.

### Test: Single couple remaining
If only 1 couple in an event, they get 1st place automatically.

### Test: All judges agree perfectly
Every judge gives identical placements — should produce clean results with no tiebreaking.

### Test: Maximum disagreement
Judges give wildly different placements — stress test the tiebreaking logic.

### Test: 3-way unbreakable tie
Three couples that cannot be separated by any rule through Rule 11 — should all receive the same placement (averaged position).

---

## Real-World Test Data (to be added)

Additional test data will be scraped from competition results websites to validate against known-correct results. Sources:
- DSCO Berkeley 2025 results (https://dsco-berkeley25.web.app/results/)
- Other competition results as provided
