/**
 * Skating system scoring engine — verbatim port of
 * src/domains/competitions/lib/scoring/engine.ts so Task 10 can run the
 * existing placement logic from Convex without crossing the convex/ boundary.
 *
 * Rules 5-8: single dance placement (majority system).
 * Rules 9-11: multi-dance event scoring (sum placements, tiebreak).
 * Callback tallying for preliminary rounds.
 */

import type {
  Marks,
  SingleDanceResult,
  MultiDanceResult,
  TabulationRow,
  CallbackTally,
} from "./types";

function getRelevantMarks(
  marks: Marks,
  couples: string[],
  place: number,
): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const couple of couples) {
    result[couple] = marks[couple]!.filter((m) => m <= place);
  }
  return result;
}

function getMajorityCouples(
  relevantMarks: Record<string, number[]>,
  majority: number,
): { counts: Array<[string, number]>; couples: string[] } {
  const counts: Array<[string, number]> = [];
  for (const [couple, marks] of Object.entries(relevantMarks)) {
    if (marks.length >= majority) {
      counts.push([couple, marks.length]);
    }
  }
  return { counts, couples: counts.map(([c]) => c) };
}

export function placeCouples(
  marks: Marks,
  currentMark: number,
  placesToAward: number,
): { results: string[]; tabulation: Record<string, string[]> } {
  const results: string[] = [];
  const unranked = new Set(Object.keys(marks));
  const tabulation: Record<string, string[]> = {};

  for (const couple of unranked) {
    tabulation[couple] = [];
  }

  const numJudges = Object.values(marks)[0]!.length;
  const majority = Math.floor(numJudges / 2) + 1;
  let currentlyAwarding = 1;

  for (let i = currentMark; i <= placesToAward; i++) {
    const unrankedList = [...unranked];
    const relevantMarks = getRelevantMarks(marks, unrankedList, i);
    const { counts: majorityCounts, couples: majorityCouples } =
      getMajorityCouples(relevantMarks, majority);

    for (const couple of unrankedList) {
      const rm = relevantMarks[couple]!;
      tabulation[couple]!.push(rm.length === 0 ? "--" : String(rm.length));
    }

    if (majorityCouples.length === 1) {
      const winner = majorityCouples[0]!;
      results.push(winner);
      unranked.delete(winner);
      for (let j = i + 1; j <= placesToAward; j++) {
        tabulation[winner]!.push("--");
      }
      tabulation[winner]!.push(String(currentlyAwarding));
      currentlyAwarding++;
    } else if (majorityCouples.length === 0) {
      continue;
    } else {
      const remainingMajority = [...majorityCouples];
      const remainingCounts = [...majorityCounts];

      while (remainingMajority.length > 0) {
        const maxCount = Math.max(...remainingCounts.map(([, c]) => c));
        const couplesWithMax = remainingCounts
          .filter(([, c]) => c === maxCount)
          .map(([couple]) => couple);

        if (couplesWithMax.length === 1) {
          const winner = couplesWithMax[0]!;
          results.push(winner);
          unranked.delete(winner);
          remainingMajority.splice(remainingMajority.indexOf(winner), 1);
          const idx = remainingCounts.findIndex(([c]) => c === winner);
          remainingCounts.splice(idx, 1);
          for (let j = i + 1; j <= placesToAward; j++) {
            tabulation[winner]!.push("--");
          }
          tabulation[winner]!.push(String(currentlyAwarding));
          currentlyAwarding++;
        } else {
          const sumsForMax: Array<[string, number]> = couplesWithMax.map(
            (c) =>
              [c, relevantMarks[c]!.reduce((a, b) => a + b, 0)] as [
                string,
                number,
              ],
          );

          const couplesWithMaxSet = new Set(couplesWithMax);

          while (couplesWithMaxSet.size > 0) {
            const activeSums = sumsForMax.filter(([c]) =>
              couplesWithMaxSet.has(c),
            );
            const minSum = Math.min(...activeSums.map(([, s]) => s));
            const couplesWithMin = activeSums
              .filter(([, s]) => s === minSum)
              .map(([c]) => c);

            if (couplesWithMin.length === 1) {
              const winner = couplesWithMin[0]!;
              tabulation[winner]![tabulation[winner]!.length - 1] +=
                `(${minSum})`;
              results.push(winner);
              unranked.delete(winner);
              remainingMajority.splice(remainingMajority.indexOf(winner), 1);
              const idx = remainingCounts.findIndex(([c]) => c === winner);
              remainingCounts.splice(idx, 1);
              couplesWithMaxSet.delete(winner);
              for (let j = i + 1; j <= placesToAward; j++) {
                tabulation[winner]!.push("--");
              }
              tabulation[winner]!.push(String(currentlyAwarding));
              currentlyAwarding++;
            } else {
              for (const c of couplesWithMin) {
                tabulation[c]![tabulation[c]!.length - 1] += `(${minSum})`;
              }

              if (i === placesToAward) {
                for (const c of couplesWithMin) {
                  results.push(c);
                  tabulation[c]!.push(String(currentlyAwarding));
                }
                return { results, tabulation };
              }

              const tiedMarks: Marks = {};
              for (const c of couplesWithMin) {
                tiedMarks[c] = marks[c]!;
              }
              const sub = placeCouples(tiedMarks, i + 1, placesToAward);

              for (const c of sub.results) {
                results.push(c);
                tabulation[c]!.push(...sub.tabulation[c]!);
                const subPlacement = parseInt(
                  tabulation[c]![tabulation[c]!.length - 1]!,
                );
                tabulation[c]![tabulation[c]!.length - 1] = String(
                  subPlacement + currentlyAwarding - 1,
                );
                unranked.delete(c);
                remainingMajority.splice(remainingMajority.indexOf(c), 1);
                const idx = remainingCounts.findIndex(([cc]) => cc === c);
                if (idx >= 0) remainingCounts.splice(idx, 1);
                couplesWithMaxSet.delete(c);
              }
              currentlyAwarding += couplesWithMin.length;
              if (currentlyAwarding > i) {
                // for-loop will advance i naturally
              }
              break;
            }
          }
        }
      }
    }
  }

  return { results, tabulation };
}

export function singleDance(marks: Marks): SingleDanceResult {
  const numCouples = Object.keys(marks).length;
  const { results, tabulation: rawTab } = placeCouples(marks, 1, numCouples);

  const tabulationResult: Record<string, TabulationRow> = {};
  let i = 0;
  while (i < results.length) {
    const couple = results[i]!;
    const rawCells = rawTab[couple]!;
    const placement = parseInt(rawCells[rawCells.length - 1]!);

    let j = i + 1;
    let positionSum = i + 1;
    while (j < results.length) {
      const nextCouple = results[j]!;
      const nextPlacement = parseInt(
        rawTab[nextCouple]![rawTab[nextCouple]!.length - 1]!,
      );
      if (nextPlacement === placement) {
        positionSum += j + 1;
      } else {
        break;
      }
      j++;
    }

    const tiedCount = j - i;
    const pointValue = positionSum / tiedCount;

    for (let k = i; k < j; k++) {
      const c = results[k]!;
      const cells = rawTab[c]!;
      tabulationResult[c] = {
        cells: [...cells, String(pointValue)],
        placement,
        pointValue,
      };
    }

    i = j;
  }

  return { orderedCouples: results, tabulation: tabulationResult };
}

function getPlaceCount(
  dancePlacements: Array<{ placement: number; pointValue: number }>,
  place: number,
): number {
  return dancePlacements.filter((d) => Math.ceil(d.placement) <= place).length;
}

function getPlaceSum(
  dancePlacements: Array<{ placement: number; pointValue: number }>,
  place: number,
): number {
  return dancePlacements
    .filter((d) => Math.ceil(d.placement) <= place)
    .reduce((sum, d) => sum + d.pointValue, 0);
}

export function multiDance(
  perDanceResults: SingleDanceResult[],
  allMarks: Marks[],
): MultiDanceResult {
  const couples =
    perDanceResults[0]!.orderedCouples.length > 0
      ? Object.keys(perDanceResults[0]!.tabulation)
      : [];

  const perDancePlacements: Record<
    string,
    Array<{ placement: number; pointValue: number }>
  > = {};
  const totals: Record<string, number> = {};

  for (const couple of couples) {
    const danceResults: Array<{ placement: number; pointValue: number }> = [];
    let total = 0;
    for (const danceResult of perDanceResults) {
      const row = danceResult.tabulation[couple]!;
      danceResults.push({
        placement: row.placement,
        pointValue: row.pointValue,
      });
      total += row.pointValue;
    }
    perDancePlacements[couple] = danceResults;
    totals[couple] = total;
  }

  const sorted = [...couples].sort((a, b) => totals[a]! - totals[b]!);

  const placements: Record<string, number> = {};
  const tiebreakRules: Record<string, string> = {};

  let awarding = 1;
  let i = 0;
  while (i < sorted.length) {
    const couple = sorted[i]!;
    const total = totals[couple]!;

    let j = i + 1;
    while (j < sorted.length && totals[sorted[j]!]! === total) {
      j++;
    }

    if (j - i === 1) {
      placements[couple] = awarding;
      tiebreakRules[couple] = "--";
    }

    awarding += j - i;
    i = j;
  }

  awarding = 1;
  i = 0;
  while (i < sorted.length) {
    const couple = sorted[i]!;

    if (couple in placements) {
      awarding++;
      i++;
      continue;
    }

    const total = totals[couple]!;
    const tied: string[] = [couple];
    let j = i + 1;
    while (j < sorted.length && totals[sorted[j]!]! === total) {
      tied.push(sorted[j]!);
      j++;
    }

    const remaining = [...tied];
    let placeToAward = awarding;

    while (remaining.length > 0) {
      if (remaining.length === 1) {
        placements[remaining[0]!] = placeToAward;
        tiebreakRules[remaining[0]!] = "R10";
        placeToAward++;
        remaining.length = 0;
        break;
      }

      let placed = false;

      const numDances = perDanceResults.length;
      for (let place = 1; place <= numDances * couples.length; place++) {
        const counts = remaining.map((c) => ({
          couple: c,
          count: getPlaceCount(perDancePlacements[c]!, place),
        }));

        const maxCount = Math.max(...counts.map((c) => c.count));
        if (maxCount === 0) continue;

        const couplesWithMax = counts.filter((c) => c.count === maxCount);

        if (couplesWithMax.length === 1) {
          const winner = couplesWithMax[0]!.couple;
          placements[winner] = placeToAward;
          tiebreakRules[winner] = "R10";
          remaining.splice(remaining.indexOf(winner), 1);
          placeToAward++;
          placed = true;
          break;
        }

        const sums = couplesWithMax.map((c) => ({
          couple: c.couple,
          sum: getPlaceSum(perDancePlacements[c.couple]!, place),
        }));

        const minSum = Math.min(...sums.map((s) => s.sum));
        const couplesWithMinSum = sums.filter((s) => s.sum === minSum);

        if (couplesWithMinSum.length === 1) {
          const winner = couplesWithMinSum[0]!.couple;
          placements[winner] = placeToAward;
          tiebreakRules[winner] = "R10";
          remaining.splice(remaining.indexOf(winner), 1);
          placeToAward++;
          placed = true;
          break;
        }
      }

      if (!placed) {
        const smushedMarks: Marks = {};
        for (const c of remaining) {
          smushedMarks[c] = [];
          for (const danceMarks of allMarks) {
            smushedMarks[c]!.push(...danceMarks[c]!);
          }
        }

        const r11 = placeCouples(
          smushedMarks,
          placeToAward,
          placeToAward + remaining.length - 1,
        );

        const r11Placements = r11.results.map((c) =>
          parseInt(r11.tabulation[c]![r11.tabulation[c]!.length - 1]!),
        );
        const allSame = r11Placements.every((p) => p === r11Placements[0]);

        if (allSame) {
          for (const c of remaining) {
            placements[c] = placeToAward;
            tiebreakRules[c] = "tie";
          }
          placeToAward += remaining.length;
          remaining.length = 0;
        } else if (remaining.length === 2) {
          const winner = r11.results[0]!;
          const loser = r11.results[1]!;
          placements[winner] = placeToAward;
          tiebreakRules[winner] = "R11";
          placements[loser] = placeToAward + 1;
          tiebreakRules[loser] = "R11";
          placeToAward += 2;
          remaining.length = 0;
        } else {
          let placedCount = 0;
          for (const c of r11.results) {
            const p = parseInt(
              r11.tabulation[c]![r11.tabulation[c]!.length - 1]!,
            );
            if (p === r11Placements[0]) {
              placements[c] = placeToAward;
              tiebreakRules[c] = "R11";
              remaining.splice(remaining.indexOf(c), 1);
              placedCount++;
            }
          }
          placeToAward += placedCount;
        }
      }
    }

    awarding = placeToAward;
    i = j;
  }

  for (const couple of couples) {
    if (!(couple in tiebreakRules)) {
      tiebreakRules[couple] = "--";
    }
  }

  return { placements, tiebreakRules, perDancePlacements, totals };
}

export function tallyCallbacks(
  marks: Record<string, boolean[]>,
): CallbackTally[] {
  const tallies: CallbackTally[] = [];
  for (const [coupleId, judgeMarks] of Object.entries(marks)) {
    tallies.push({
      coupleId,
      totalMarks: judgeMarks.filter(Boolean).length,
    });
  }
  return tallies.sort((a, b) => b.totalMarks - a.totalMarks);
}
