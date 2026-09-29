/**
 * Shared topology derivation and layout, used by both the per-session replay
 * topology and the aggregate overview heatmap.
 *
 * Builds a tiered graph (frontend → agents → services → inference/data) from a
 * flat list of spans: agent→agent delegation, service→model inference,
 * agent→hosting-service, and downstream service calls. Agents are split into
 * sub-rows by delegation depth so callers sit above callees.
 */

import { AgentIcon, AIModelIcon, ServicesIcon, DesktopIcon } from "@dynatrace/strato-icons";
import { agentColor, providerColor } from "./palette";
import type { ReplaySpan } from "./types";

export type Tier = 0 | 1 | 2 | 3;

/** Icon per tier, matching the Dynatrace AI Observability entity icons. */
export const TIER_ICON = [DesktopIcon, AgentIcon, ServicesIcon, AIModelIcon] as const;

export interface GraphNode {
  id: string;
  label: string;
  tier: Tier;
  color: string;
  firstStart: number;
  spanIds: string[];
  /** Vertical row (0 = top). Agents split into sub-rows by delegation depth. */
  row: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  spanIds: string[];
}

export interface TopologyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  totalRows: number;
  /** span id → node id, for attributing per-span metrics to nodes. */
  spanNode: Map<string, string>;
}

/** An authoritative structural edge (from Smartscape), in node-id scheme. */
export interface StructuralEdge {
  source: string;
  target: string;
}

// Layout constants (SVG user units).
export const WIDTH = 900;
export const SIDE_PAD = 40;
export const TOP_PAD = 44;
export const BOT_PAD = 40;
export const ROW_GAP = 104;
export const R = 22;

export function shortService(service: string | null): string {
  if (!service) return "system";
  return service.replace(/^smartfreight-/, "").replace(/-service$/, "") || service;
}

function nodeFor(span: ReplaySpan): { id: string; label: string; tier: Tier; color: string } | null {
  const service = span.service ?? "";
  if (span.kind === "llm") {
    const label = span.model ?? span.provider ?? "model";
    return { id: `inf:${label}`, label, tier: 3, color: providerColor(span.provider) };
  }
  if (/frontend/i.test(service)) {
    const label = shortService(service);
    return { id: `fe:${label}`, label, tier: 0, color: "#378ADD" };
  }
  if (span.agent) {
    return { id: `agent:${span.agent}`, label: span.agent, tier: 1, color: agentColor(span.agent) };
  }
  if (service) {
    const label = shortService(service);
    return { id: `svc:${label}`, label, tier: 2, color: "#888780" };
  }
  return null;
}

export function buildTopology(
  spans: ReplaySpan[],
  structuralEdges?: StructuralEdge[],
): TopologyGraph {
  const nodeMap = new Map<string, GraphNode>();
  const spanNode = new Map<string, string>();
  const byId = new Map(spans.map((s) => [s.spanId, s]));

  for (const s of spans) {
    const n = nodeFor(s);
    if (!n) continue;
    spanNode.set(s.spanId, n.id);
    const existing = nodeMap.get(n.id);
    if (existing) {
      existing.firstStart = Math.min(existing.firstStart, s.start);
      existing.spanIds.push(s.spanId);
    } else {
      nodeMap.set(n.id, { ...n, firstStart: s.start, spanIds: [s.spanId], row: 0 });
    }
  }

  const edgeMap = new Map<string, GraphEdge>();
  const addEdge = (source: string, target: string, spanId: string) => {
    if (source === target) return;
    const id = `${source}->${target}`;
    const e = edgeMap.get(id);
    if (e) e.spanIds.push(spanId);
    else edgeMap.set(id, { id, source, target, spanIds: [spanId] });
  };

  const childrenMap = new Map<string, ReplaySpan[]>();
  for (const s of spans) {
    if (!s.parentId) continue;
    const arr = childrenMap.get(s.parentId);
    if (arr) arr.push(s);
    else childrenMap.set(s.parentId, [s]);
  }

  // 1) Agent → agent delegation (from the delegating agent's own A2A span).
  for (const s of spans) {
    if (s.kind !== "delegation") continue;
    const src = spanNode.get(s.spanId);
    if (!src || !src.startsWith("agent:")) continue;
    const queue = [...(childrenMap.get(s.spanId) ?? [])];
    const seen = new Set<string>();
    while (queue.length) {
      const d = queue.shift()!;
      if (seen.has(d.spanId)) continue;
      seen.add(d.spanId);
      const dn = spanNode.get(d.spanId);
      if (dn && dn.startsWith("agent:") && dn !== src) {
        addEdge(src, dn, s.spanId);
        break;
      }
      for (const c of childrenMap.get(d.spanId) ?? []) queue.push(c);
    }
  }

  // Ensure a service node exists for each LLM span's service and carries the
  // span, so services light up during inference regardless of the edge source.
  for (const s of spans) {
    if (s.kind !== "llm") continue;
    const svc = s.service;
    if (!svc || /frontend/i.test(svc)) continue;
    const label = shortService(svc);
    const id = `svc:${label}`;
    const node = nodeMap.get(id);
    if (node) {
      node.spanIds.push(s.spanId);
      node.firstStart = Math.min(node.firstStart, s.start);
    } else {
      nodeMap.set(id, { id, label, tier: 2, color: "#888780", firstStart: s.start, spanIds: [s.spanId], row: 0 });
    }
  }

  // 2 + 3) Structural edges (agent → service, service → model).
  const hostingServiceIds = new Set<string>();
  const useSmartscape = !!structuralEdges && structuralEdges.length > 0;

  if (useSmartscape) {
    // Authoritative structure from Smartscape. Activation spans come from the
    // target node, so an edge lights up while its target is active.
    const nodeSpans = new Map<string, string[]>();
    for (const [spanId, nodeId] of spanNode) {
      const arr = nodeSpans.get(nodeId);
      if (arr) arr.push(spanId);
      else nodeSpans.set(nodeId, [spanId]);
    }
    for (const e of structuralEdges ?? []) {
      if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
      const spanIds = nodeSpans.get(e.target) ?? [];
      for (const sid of spanIds.length ? spanIds : [""]) addEdge(e.source, e.target, sid);
      if (e.source.startsWith("agent:") && e.target.startsWith("svc:")) hostingServiceIds.add(e.target);
    }
    // Safety net: connect any model node the structural edges missed (e.g.
    // provider-only spans that carry no model name) via its span's service.
    for (const s of spans) {
      if (s.kind !== "llm") continue;
      const svc = s.service;
      if (!svc || /frontend/i.test(svc)) continue;
      const modelId = `inf:${s.model ?? s.provider ?? "model"}`;
      if (!nodeMap.has(modelId)) continue;
      const hasInbound = [...edgeMap.values()].some((ed) => ed.target === modelId);
      if (!hasInbound) addEdge(`svc:${shortService(svc)}`, modelId, s.spanId);
    }
  } else {
    // Fallback: derive structure from spans (Smartscape preview unavailable).
    for (const s of spans) {
      if (s.kind !== "llm") continue;
      const svc = s.service;
      if (!svc || /frontend/i.test(svc)) continue;
      addEdge(`svc:${shortService(svc)}`, `inf:${s.model ?? s.provider ?? "model"}`, s.spanId);
    }
    for (const n of nodeMap.values()) {
      if (n.tier !== 1) continue;
      const counts = new Map<string, number>();
      for (const id of n.spanIds) {
        const svc = byId.get(id)?.service ?? null;
        if (!svc || /frontend/i.test(svc)) continue;
        const label = shortService(svc);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      let host: string | undefined;
      let max = 0;
      for (const [label, c] of counts) {
        if (c > max) {
          max = c;
          host = label;
        }
      }
      if (host && nodeMap.has(`svc:${host}`)) {
        addEdge(n.id, `svc:${host}`, n.spanIds[0]);
        hostingServiceIds.add(`svc:${host}`);
      }
    }
  }

  // 4) Downstream services/APIs (e.g. tms-api): wire from the nearest caller.
  // Smartscape's SERVICE→SERVICE edges already cover this, so only needed in
  // the span-derived fallback.
  if (!useSmartscape) {
    for (const n of nodeMap.values()) {
      if (n.tier !== 2 || hostingServiceIds.has(n.id)) continue;
      const callers = new Set<string>();
      for (const id of n.spanIds) {
        let cur = byId.get(id);
        cur = cur?.parentId ? byId.get(cur.parentId) : undefined;
        const seen = new Set<string>();
        while (cur && !seen.has(cur.spanId)) {
          seen.add(cur.spanId);
          const pn = spanNode.get(cur.spanId);
          if (pn && pn !== n.id) {
            callers.add(pn);
            break;
          }
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
      }
      for (const c of callers) addEdge(c, n.id, n.spanIds[0]);
    }
  }

  const nodes = [...nodeMap.values()];
  const byTier: Record<number, GraphNode[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const n of nodes) byTier[n.tier].push(n);
  for (const t of Object.keys(byTier)) byTier[Number(t)].sort((a, b) => a.firstStart - b.firstStart);

  // Frontend edges. Smartscape provides authoritative SERVICE→SERVICE edges
  // from the frontend, so use them directly. In the span fallback the frontend
  // proxies calls to every sub-agent, so collapse it to a single edge into the
  // entry (root-most) node.
  const frontendIds = new Set(byTier[0].map((n) => n.id));
  const entry = byTier[1][0] ?? byTier[2][0];
  let edges = [...edgeMap.values()];
  if (!useSmartscape && frontendIds.size > 0 && entry) {
    edges = edges.filter((e) => !frontendIds.has(e.source));
    for (const fe of byTier[0]) {
      if (fe.id === entry.id) continue;
      edges.push({ id: `${fe.id}->${entry.id}`, source: fe.id, target: entry.id, spanIds: fe.spanIds });
    }
  }

  // Delegation depth → agent sub-rows (callers above callees).
  const agentAdj = new Map<string, string[]>();
  for (const e of edges) {
    if (e.source.startsWith("agent:") && e.target.startsWith("agent:")) {
      const arr = agentAdj.get(e.source);
      if (arr) arr.push(e.target);
      else agentAdj.set(e.source, [e.target]);
    }
  }
  const depth = new Map<string, number>();
  if (entry && entry.id.startsWith("agent:")) {
    const q = [entry.id];
    depth.set(entry.id, 0);
    while (q.length) {
      const cur = q.shift()!;
      const d = depth.get(cur)!;
      for (const nx of agentAdj.get(cur) ?? []) {
        if (!depth.has(nx)) {
          depth.set(nx, d + 1);
          q.push(nx);
        }
      }
    }
  }
  const maxAgentDepth = byTier[1].reduce((m, n) => Math.max(m, depth.get(n.id) ?? 0), 0);

  for (const n of nodes) {
    if (n.tier === 0) n.row = 0;
    else if (n.tier === 1) n.row = 1 + (depth.get(n.id) ?? 0);
    else if (n.tier === 2) n.row = 2 + maxAgentDepth;
    else n.row = 3 + maxAgentDepth;
  }
  const totalRows = 4 + maxAgentDepth;

  return { nodes, edges, totalRows, spanNode };
}

export interface Layout {
  pos: Map<string, { x: number; y: number }>;
  height: number;
}

export function layoutTopology(nodes: GraphNode[], totalRows: number): Layout {
  const pos = new Map<string, { x: number; y: number }>();
  const byRow = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const arr = byRow.get(n.row);
    if (arr) arr.push(n);
    else byRow.set(n.row, [n]);
  }
  for (const [row, list] of byRow) {
    list.sort((a, b) => a.firstStart - b.firstStart);
    const slot = (WIDTH - 2 * SIDE_PAD) / list.length;
    list.forEach((n, i) => pos.set(n.id, { x: SIDE_PAD + slot * (i + 0.5), y: TOP_PAD + row * ROW_GAP }));
  }
  const height = TOP_PAD + Math.max(totalRows - 1, 0) * ROW_GAP + BOT_PAD;
  return { pos, height };
}

/** Sequential heat ramp: 0 = cool blue → 0.5 = amber → 1 = hot red. */
export function heatColor(t: number): string {
  const c = Math.max(0, Math.min(1, t));
  const stops = [
    [0x37, 0x8a, 0xdd], // blue
    [0xef, 0x9f, 0x27], // amber
    [0xe2, 0x4b, 0x4a], // red
  ];
  const seg = c <= 0.5 ? 0 : 1;
  const f = c <= 0.5 ? c / 0.5 : (c - 0.5) / 0.5;
  const a = stops[seg];
  const b = stops[seg + 1];
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * f);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}
