/**
 * Skating system scoring types.
 *
 * Marks map couple IDs to arrays of judge placements.
 * Results map couple IDs to their computed placements and tabulation data.
 */

/** Raw marks: coupleId -> array of judge placements (one per judge) */
export type Marks = Record<string, number[]>;

/** A single cell in the tabulation table */
export type TabulationCell = string;

/** A full tabulation row for one couple */
export interface TabulationRow {
  /** Tabulation cells: count columns, then placement, then point value */
  cells: TabulationCell[];
  /** Final placement (integer) */
  placement: number;
  /** Point value — differs from placement when ties exist (e.g., 1.5 for tied 1st/2nd) */
  pointValue: number;
}

/** Result of scoring a single dance via Rules 5-8 */
export interface SingleDanceResult {
  /** Couples ordered from first to last */
  orderedCouples: string[];
  /** Tabulation table: coupleId -> row data */
  tabulation: Record<string, TabulationRow>;
}

/** Result of scoring a multi-dance event via Rules 9-11 */
export interface MultiDanceResult {
  /** Final placements: coupleId -> placement */
  placements: Record<string, number>;
  /** Which rule broke each tie: coupleId -> rule string (e.g., "R10", "R11", "--") */
  tiebreakRules: Record<string, string>;
  /** Per-dance results for each couple: coupleId -> array of (placement, pointValue) per dance */
  perDancePlacements: Record<string, Array<{ placement: number; pointValue: number }>>;
  /** Summary totals: coupleId -> sum of point values across dances */
  totals: Record<string, number>;
}

/** Callback tally result for a single couple in a preliminary round */
export interface CallbackTally {
  coupleId: string;
  totalMarks: number;
}
