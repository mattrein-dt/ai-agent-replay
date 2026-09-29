/** Stable, readable colors for providers / agents used across all views. */

const PROVIDER_COLORS: Record<string, string> = {
  "azure.ai.openai": "#378ADD",
  openai: "#378ADD",
  "aws.bedrock": "#1D9E75",
  amazon: "#1D9E75",
  anthropic: "#7F77DD",
  "gcp.gen_ai": "#EF9F27",
  google: "#EF9F27",
  langchain: "#D4537E",
};

/** Fallback cycle for anything not explicitly mapped. */
const CYCLE = [
  "#378ADD",
  "#1D9E75",
  "#7F77DD",
  "#EF9F27",
  "#D4537E",
  "#D85A30",
  "#639922",
  "#E24B4A",
];

const NEUTRAL = "#888780";

const assigned = new Map<string, string>();
let cursor = 0;

/** Deterministic color for a provider name (case-insensitive), stable per session. */
export function providerColor(provider: string | null | undefined): string {
  if (!provider) return NEUTRAL;
  const key = provider.toLowerCase();
  if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key];
  if (assigned.has(key)) return assigned.get(key)!;
  const color = CYCLE[cursor % CYCLE.length];
  cursor += 1;
  assigned.set(key, color);
  return color;
}

const AGENT_CYCLE = [
  "#378ADD",
  "#1D9E75",
  "#7F77DD",
  "#EF9F27",
  "#D4537E",
  "#D85A30",
];
const agentAssigned = new Map<string, string>();
let agentCursor = 0;

/** Deterministic color for an agent/lane name. */
export function agentColor(agent: string | null | undefined): string {
  if (!agent) return NEUTRAL;
  if (agentAssigned.has(agent)) return agentAssigned.get(agent)!;
  const color = AGENT_CYCLE[agentCursor % AGENT_CYCLE.length];
  agentCursor += 1;
  agentAssigned.set(agent, color);
  return color;
}

export const NEUTRAL_COLOR = NEUTRAL;

/** Convert a #rrggbb hex to an rgba() string with the given alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
