/** Timeframe options for the workspace, expressed as DQL `from:` expressions. */

export interface TimeframeOption {
  key: string;
  label: string;
  from: string;
}

export const TIMEFRAMES: TimeframeOption[] = [
  { key: "30m", label: "30m", from: "now()-30m" },
  { key: "1h", label: "1h", from: "now()-1h" },
  { key: "6h", label: "6h", from: "now()-6h" },
  { key: "24h", label: "24h", from: "now()-24h" },
  { key: "7d", label: "7d", from: "now()-7d" },
];

export const DEFAULT_TIMEFRAME_KEY = "24h";

export function timeframeFrom(key: string): string {
  return TIMEFRAMES.find((t) => t.key === key)?.from ?? "now()-24h";
}
