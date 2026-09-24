/** Products older than this are treated as stale and never recommended. */
export const FRESHNESS_DAYS = 7;

export function freshSince(now = Date.now()): string {
  return new Date(now - FRESHNESS_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
