/**
 * Pagination helpers for index-backed list queries. Keep page sizes bounded
 * so list endpoints (feeds, messages, notifications, dashboards) never return
 * unbounded result sets.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/** Clamp a caller-supplied page size into `[1, MAX_PAGE_SIZE]`. */
export function clampPageSize(limit: number | undefined): number {
  if (!limit) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
}
