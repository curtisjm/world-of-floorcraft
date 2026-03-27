export type DanceListItem = {
  id: number;
  name: string;
  displayName: string;
  timeSignature: string | null;
};

const DANCE_BROWSE_ORDER = [
  "waltz",
  "tango",
  "viennese-waltz",
  "foxtrot",
  "quickstep",
] as const;

const DANCE_BROWSE_ORDER_MAP = new Map(
  DANCE_BROWSE_ORDER.map((name, index) => [name, index] as const)
);

export function sortDancesForBrowse<T extends DanceListItem>(dances: T[]): T[] {
  return [...dances].sort((left, right) => {
    const leftIndex =
      DANCE_BROWSE_ORDER_MAP.get(left.name as (typeof DANCE_BROWSE_ORDER)[number]) ??
      Number.MAX_SAFE_INTEGER;
    const rightIndex =
      DANCE_BROWSE_ORDER_MAP.get(right.name as (typeof DANCE_BROWSE_ORDER)[number]) ??
      Number.MAX_SAFE_INTEGER;

    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }

    return left.displayName.localeCompare(right.displayName);
  });
}
