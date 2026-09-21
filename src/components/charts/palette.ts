/**
 * One categorical ramp for every chart in the app so a niche keeps the same
 * colour wherever it appears. Ordered for maximum separation between neighbours.
 */
export const SERIES_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#16a34a",
  "#db2777",
  "#ca8a04",
  "#4f46e5",
  "#0d9488",
  "#dc2626",
];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}
