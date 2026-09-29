/** Domain types for the agent-replay data model. */

/** A flattened chat message for the prompt/response viewer. */
export interface ChatMessage {
  role: string;
  text: string;
}

export type SpanKind =
  | "llm"
  | "tool"
  | "agent"
  | "delegation"
  | "workflow"
  | "http"
  | "other";

/** One raw span, normalized from a Grail record. */
export interface ReplaySpan {
  spanId: string;
  parentId: string | null;
  /** Trace this span belongs to (populated for aggregate/overview queries). */
  traceId: string | null;
  name: string;
  service: string | null;
  /** Epoch milliseconds. */
  start: number;
  durationMs: number;
  /** start + durationMs, epoch milliseconds. */
  end: number;
  op: string | null;
  agent: string | null;
  model: string | null;
  provider: string | null;
  tool: string | null;
  inTokens: number | null;
  outTokens: number | null;
  cacheReadTokens: number | null;
  status: string | null;
  finishReasons: string[] | null;
  inputMessages: ChatMessage[] | null;
  outputMessages: ChatMessage[] | null;
  kind: SpanKind;
  /** Lane the span is rendered in (resolved agent, else service). */
  lane: string;
  /** Depth in the span tree (root = 0). */
  depth: number;
  isError: boolean;
}

/** A horizontal swimlane in the timeline (one agent or service). */
export interface Lane {
  id: string;
  label: string;
  /** First start time of any span in the lane (for ordering). */
  firstStart: number;
  spanCount: number;
}

/** One token-consuming LLM call, used by the spend bar. */
export interface TokenSegment {
  spanId: string;
  label: string;
  provider: string | null;
  model: string | null;
  agent: string | null;
  start: number;
  end: number;
  inTokens: number;
  outTokens: number;
  cacheReadTokens: number;
  tokens: number;
  /** Cumulative tokens up to and including this segment. */
  cumulativeStart: number;
  cumulativeEnd: number;
  color: string;
}

export interface TopologyNode {
  id: string;
  label: string;
  type: "agent" | "model" | "provider";
  color: string;
}

export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  kind: "delegation" | "uses";
  /** Span ids that realize this edge, for time-based activation. */
  spanIds: string[];
}

/** Point-in-time events surfaced as markers on the timeline. */
export interface ReplayMarker {
  time: number;
  kind: "error" | "guardrail";
  label: string;
  spanId: string;
}

/** The full, built model that drives every visualization. */
export interface TraceModel {
  traceId: string;
  start: number;
  end: number;
  durationMs: number;
  spans: ReplaySpan[];
  lanes: Lane[];
  segments: TokenSegment[];
  totalTokens: number;
  totalInTokens: number;
  totalOutTokens: number;
  totalCacheReadTokens: number;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  markers: ReplayMarker[];
  /** Repeated-tool-call loop warnings, if any. */
  loopWarnings: string[];
}

/** A row in the session picker. */
export interface SessionSummary {
  traceId: string;
  start: number;
  end: number;
  durationMs: number;
  spans: number;
  llmCalls: number;
  agents: number;
  inTokens: number;
  outTokens: number;
  totalTokens: number;
  errors: number;
}
