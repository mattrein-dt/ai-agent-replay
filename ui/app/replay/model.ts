/** Transforms raw Grail records into the TraceModel that drives every view. */

import { providerColor } from "./palette";
import type {
  ChatMessage,
  Lane,
  ReplayMarker,
  ReplaySpan,
  SessionSummary,
  SpanKind,
  TokenSegment,
  TopologyEdge,
  TopologyNode,
  TraceModel,
} from "./types";

type Rec = Record<string, unknown>;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function toMillis(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function toStrArray(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map((x) => toStr(x) ?? "").filter(Boolean);
  const s = toStr(v);
  if (!s) return null;
  // Some backends serialize array fields as a JSON string, e.g. '["stop"]'.
  if (s.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => toStr(x) ?? "").filter(Boolean);
    } catch {
      /* fall through to treating it as a single value */
    }
  }
  return [s];
}

/** Flatten a GenAI messages payload (`gen_ai.input/output.messages`) into role + text. */
function parseMessages(v: unknown): ChatMessage[] | null {
  if (v === null || v === undefined) return null;
  let data: unknown = v;
  if (typeof v === "string") {
    try {
      data = JSON.parse(v);
    } catch {
      return [{ role: "raw", text: v }];
    }
  }
  if (!Array.isArray(data)) return null;
  const messages: ChatMessage[] = [];
  for (const m of data) {
    if (!m || typeof m !== "object") continue;
    const msg = m as Record<string, unknown>;
    const role = typeof msg.role === "string" ? msg.role : "message";
    const chunks: string[] = [];
    const parts = Array.isArray(msg.parts) ? msg.parts : null;
    if (parts) {
      for (const p of parts) {
        if (!p || typeof p !== "object") continue;
        const part = p as Record<string, unknown>;
        if (part.type === "tool_call" || typeof part.name === "string") {
          const name = typeof part.name === "string" ? part.name : "tool_call";
          const args = part.arguments !== undefined ? JSON.stringify(part.arguments) : "";
          chunks.push(`⚙ ${name}(${args})`);
        } else if (typeof part.content === "string") {
          chunks.push(part.content);
        } else if (part.content !== undefined) {
          chunks.push(JSON.stringify(part.content));
        }
      }
    } else if (typeof msg.content === "string") {
      chunks.push(msg.content);
    } else if (msg.content !== undefined) {
      chunks.push(JSON.stringify(msg.content));
    }
    const text = chunks.join("\n").trim();
    if (text) messages.push({ role, text });
  }
  return messages.length ? messages : null;
}

const HTTP_VERBS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"]);

function isDelegation(name: string): boolean {
  return name.startsWith("a2a ") || name.startsWith("a2a.");
}

/** Target sub-agent name encoded in an A2A span name, e.g. "a2a route-planner". */
function delegationTarget(name: string): string {
  return name.replace(/^a2a[ .]/, "").split(/[ .]/)[0] || "sub-agent";
}

function classify(name: string, op: string | null, hasTokens: boolean, tool: string | null): SpanKind {
  if (name.endsWith(".workflow")) return "workflow";
  if (op === "execute_tool" || tool) return "tool";
  if (op === "chat" || op === "generate_content" || hasTokens) return "llm";
  if (isDelegation(name)) return "delegation";
  if (op === "invoke_agent" || name.endsWith(".agent")) return "agent";
  const verb = name.split(" ")[0];
  if (HTTP_VERBS.has(verb) || name.startsWith("ngx_")) return "http";
  return "other";
}

function shortService(service: string | null): string {
  if (!service) return "system";
  return service.replace(/^smartfreight-/, "").replace(/-service$/, "") || service;
}

/**
 * Resolve which agent "owns" a span by walking up the span tree: an A2A
 * delegation ancestor names the sub-agent it hands off to; otherwise the
 * nearest ancestor with an explicit agent name wins.
 */
function resolveAgent(
  span: { spanId: string; parentId: string | null; agent: string | null; name: string; service: string | null },
  byId: Map<string, { spanId: string; parentId: string | null; agent: string | null; name: string; service: string | null }>,
): string {
  let cur: typeof span | undefined = span;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.spanId)) {
    seen.add(cur.spanId);
    if (isDelegation(cur.name)) return delegationTarget(cur.name);
    if (cur.agent) return cur.agent;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return shortService(span.service);
}

function depthOf(
  span: { spanId: string; parentId: string | null },
  byId: Map<string, { spanId: string; parentId: string | null }>,
): number {
  let d = 0;
  let cur = span.parentId ? byId.get(span.parentId) : undefined;
  const seen = new Set<string>([span.spanId]);
  while (cur && !seen.has(cur.spanId)) {
    seen.add(cur.spanId);
    d += 1;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return d;
}

export function buildTraceModel(traceId: string, records: Rec[]): TraceModel {
  // First pass: minimal shape for tree resolution.
  const raw = records.map((r) => {
    const start = toMillis(r.start);
    const durationMs = toNum(r.duration_ms) ?? 0;
    return {
      spanId: toStr(r.span_id) ?? "",
      parentId: toStr(r.parent_id),
      traceId: toStr(r.trace_id),
      name: toStr(r.name) ?? "(unnamed)",
      service: toStr(r.service),
      start,
      durationMs,
      end: start + durationMs,
      op: toStr(r.op),
      agent: toStr(r.agent),
      model: toStr(r.model),
      provider: toStr(r.provider),
      tool: toStr(r.tool),
      inTokens: toNum(r.in_tok),
      outTokens: toNum(r.out_tok),
      cacheReadTokens: toNum(r.cache_read),
      status: toStr(r.status),
      finishReasons: toStrArray(r.finish),
      inputMessages: parseMessages(r.input_msgs),
      outputMessages: parseMessages(r.output_msgs),
    };
  });

  const byId = new Map(raw.map((s) => [s.spanId, s]));

  const spans: ReplaySpan[] = raw.map((s) => {
    const hasTokens = s.inTokens !== null || s.outTokens !== null;
    return {
      ...s,
      kind: classify(s.name, s.op, hasTokens, s.tool),
      lane: resolveAgent(s, byId),
      depth: depthOf(s, byId),
      isError: s.status === "error",
    };
  });

  const start = spans.length ? Math.min(...spans.map((s) => s.start)) : 0;
  const end = spans.length ? Math.max(...spans.map((s) => s.end)) : 0;

  // Lanes ordered by first appearance.
  const laneMap = new Map<string, Lane>();
  for (const s of spans) {
    const existing = laneMap.get(s.lane);
    if (existing) {
      existing.firstStart = Math.min(existing.firstStart, s.start);
      existing.spanCount += 1;
    } else {
      laneMap.set(s.lane, { id: s.lane, label: s.lane, firstStart: s.start, spanCount: 1 });
    }
  }
  const lanes = [...laneMap.values()].sort((a, b) => a.firstStart - b.firstStart);

  // Token segments from LLM spans, in call order.
  const llmSpans = spans
    .filter((s) => (s.inTokens ?? 0) + (s.outTokens ?? 0) > 0)
    .sort((a, b) => a.start - b.start);
  let cumulative = 0;
  const segments: TokenSegment[] = llmSpans.map((s) => {
    const tokens = (s.inTokens ?? 0) + (s.outTokens ?? 0);
    const seg: TokenSegment = {
      spanId: s.spanId,
      label: s.model ?? s.name,
      provider: s.provider,
      model: s.model,
      agent: s.lane,
      start: s.start,
      end: s.end,
      inTokens: s.inTokens ?? 0,
      outTokens: s.outTokens ?? 0,
      cacheReadTokens: s.cacheReadTokens ?? 0,
      tokens,
      cumulativeStart: cumulative,
      cumulativeEnd: cumulative + tokens,
      color: providerColor(s.provider),
    };
    cumulative += tokens;
    return seg;
  });
  const totalTokens = cumulative;
  const totalInTokens = segments.reduce((a, s) => a + s.inTokens, 0);
  const totalOutTokens = segments.reduce((a, s) => a + s.outTokens, 0);
  const totalCacheReadTokens = segments.reduce((a, s) => a + s.cacheReadTokens, 0);

  // Topology.
  const nodes = new Map<string, TopologyNode>();
  const edges = new Map<string, TopologyEdge>();
  const addNode = (n: TopologyNode) => {
    if (!nodes.has(n.id)) nodes.set(n.id, n);
  };
  const addEdgeSpan = (edge: Omit<TopologyEdge, "spanIds">, spanId: string) => {
    const existing = edges.get(edge.id);
    if (existing) existing.spanIds.push(spanId);
    else edges.set(edge.id, { ...edge, spanIds: [spanId] });
  };

  for (const s of spans) {
    if (s.kind === "delegation") {
      const src = s.parentId ? resolveAgent(byId.get(s.parentId)!, byId) : "system";
      const tgt = delegationTarget(s.name);
      addNode({ id: `agent:${src}`, label: src, type: "agent", color: "#888780" });
      addNode({ id: `agent:${tgt}`, label: tgt, type: "agent", color: "#888780" });
      addEdgeSpan(
        { id: `del:${src}->${tgt}`, source: `agent:${src}`, target: `agent:${tgt}`, kind: "delegation" },
        s.spanId,
      );
    }
    if (s.kind === "llm") {
      const agent = s.lane;
      const modelLabel = s.model ?? s.provider ?? "model";
      const modelId = `model:${modelLabel}`;
      addNode({ id: `agent:${agent}`, label: agent, type: "agent", color: "#888780" });
      addNode({ id: modelId, label: modelLabel, type: "model", color: providerColor(s.provider) });
      addEdgeSpan(
        { id: `uses:${agent}->${modelLabel}`, source: `agent:${agent}`, target: modelId, kind: "uses" },
        s.spanId,
      );
    }
  }

  // Markers: errors and guardrail finish reasons.
  const markers: ReplayMarker[] = [];
  for (const s of spans) {
    if (s.isError) markers.push({ time: s.end, kind: "error", label: `error: ${s.name}`, spanId: s.spanId });
    const fr = s.finishReasons ?? [];
    if (fr.some((r) => r === "content_filter" || r === "length")) {
      markers.push({ time: s.end, kind: "guardrail", label: `finish: ${fr.join(", ")}`, spanId: s.spanId });
    }
  }

  // Loop detection: same tool called many times in this trace.
  const toolCounts = new Map<string, number>();
  for (const s of spans) {
    if (s.kind === "tool" && s.tool) toolCounts.set(s.tool, (toolCounts.get(s.tool) ?? 0) + 1);
  }
  const loopWarnings: string[] = [];
  for (const [tool, count] of toolCounts) {
    if (count > 8) loopWarnings.push(`Tool "${tool}" called ${count}× in one turn (possible loop)`);
  }

  return {
    traceId,
    start,
    end,
    durationMs: end - start,
    spans,
    lanes,
    segments,
    totalTokens,
    totalInTokens,
    totalOutTokens,
    totalCacheReadTokens,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    markers,
    loopWarnings,
  };
}

export function buildSessionSummaries(records: Rec[]): SessionSummary[] {
  return records.map((r) => {
    const inTokens = toNum(r.in_tok) ?? 0;
    const outTokens = toNum(r.out_tok) ?? 0;
    return {
      traceId: toStr(r["trace.id"]) ?? "",
      start: toMillis(r.start),
      end: toMillis(r.endt),
      durationMs: toNum(r.duration_ms) ?? 0,
      spans: toNum(r.spans) ?? 0,
      llmCalls: toNum(r.llm) ?? 0,
      agents: toNum(r.agents) ?? 0,
      inTokens,
      outTokens,
      totalTokens: inTokens + outTokens,
      errors: toNum(r.errors) ?? 0,
    };
  });
}
