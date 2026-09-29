/**
 * Estimated token pricing. Grail stores no cost field, so cost is derived from
 * token counts × a per-model rate. These defaults are rough public list prices
 * (USD per 1M tokens) and are meant as an at-a-glance estimate, not billing.
 */

import type { TokenSegment, TraceModel } from "./types";
import type { CostView } from "./components/TokenBar";

interface Price {
  input: number;
  output: number;
}

/** Matched by case-insensitive substring against model, then provider. */
const PRICE_TABLE: { match: string; price: Price }[] = [
  { match: "gpt-4o-mini", price: { input: 0.15, output: 0.6 } },
  { match: "gpt-4o", price: { input: 2.5, output: 10 } },
  { match: "gpt-4", price: { input: 2.5, output: 10 } },
  { match: "claude-sonnet", price: { input: 3, output: 15 } },
  { match: "claude-haiku", price: { input: 0.8, output: 4 } },
  { match: "claude-opus", price: { input: 15, output: 75 } },
  { match: "nova-pro", price: { input: 0.8, output: 3.2 } },
  { match: "nova-lite", price: { input: 0.06, output: 0.24 } },
  { match: "llama3", price: { input: 0.72, output: 0.72 } },
  { match: "gemini-2.5-flash", price: { input: 0.3, output: 2.5 } },
  { match: "gemini", price: { input: 0.3, output: 2.5 } },
  // provider fallbacks
  { match: "azure.ai.openai", price: { input: 2.5, output: 10 } },
  { match: "openai", price: { input: 2.5, output: 10 } },
  { match: "anthropic", price: { input: 3, output: 15 } },
];

function priceFor(seg: TokenSegment): Price | null {
  const keys = [seg.model, seg.provider].filter(Boolean).map((k) => k!.toLowerCase());
  for (const entry of PRICE_TABLE) {
    if (keys.some((k) => k.includes(entry.match))) return entry.price;
  }
  return null;
}

function segCost(seg: TokenSegment): number | null {
  const p = priceFor(seg);
  if (!p) return null;
  return (seg.inTokens / 1e6) * p.input + (seg.outTokens / 1e6) * p.output;
}

export function buildCostView(model: TraceModel): CostView {
  const total = model.segments.reduce((a, s) => a + (segCost(s) ?? 0), 0);
  return { perSegment: segCost, total };
}
