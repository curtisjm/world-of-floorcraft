/**
 * Skating system scoring types.
 *
 * Marks map couple IDs (string-keyed) to arrays of judge placements.
 * Results map couple IDs to their computed placements and tabulation data.
 */

/** Raw marks: coupleId -> array of judge placements (one per judge) */
export type Marks = Record<string, number[]>;

export type TabulationCell = string;

export interface TabulationRow {
  cells: TabulationCell[];
  placement: number;
  pointValue: number;
}

export interface SingleDanceResult {
  orderedCouples: string[];
  tabulation: Record<string, TabulationRow>;
}

export interface MultiDanceResult {
  placements: Record<string, number>;
  tiebreakRules: Record<string, string>;
  perDancePlacements: Record<
    string,
    Array<{ placement: number; pointValue: number }>
  >;
  totals: Record<string, number>;
}

export interface CallbackTally {
  coupleId: string;
  totalMarks: number;
}
