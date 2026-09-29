import { useMemo } from "react";
import { useDql } from "@dynatrace-sdk/react-hooks";
import { buildSessionSummaries, buildTraceModel } from "./model";
import {
  agentAppsQuery,
  AGENT_SERVICE_PREFIX,
  overviewSpansQuery,
  sessionListQuery,
  smartscapeEdgesQuery,
  smartscapeNodesQuery,
  traceDetailQuery,
  type Timeframe,
} from "./queries";
import { buildTopology, shortService, type StructuralEdge, type TopologyGraph } from "./topologyGraph";
import type { ReplaySpan, SessionSummary, TraceModel } from "./types";

/**
 * Authoritative topology structure from GenAI Smartscape entities, resolved to
 * the node-id scheme used by the graph (agent:/svc:/inf:). Structural edges are
 * agent → service and service → model; activation/metrics are overlaid from
 * spans by matching names. Empty when the Smartscape preview is unavailable, in
 * which case the topology falls back to span-derived structure.
 */
export function useSmartscapeStructure(): { structuralEdges: StructuralEdge[]; isLoading: boolean } {
  const nodesRes = useDql({ query: smartscapeNodesQuery() });
  const edgesRes = useDql({ query: smartscapeEdgesQuery() });

  const structuralEdges = useMemo(() => {
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const nodeById = new Map<string, { type: string; name: string }>();
    for (const r of nodesRes.data?.records ?? []) {
      const rec = r as Record<string, unknown>;
      nodeById.set(str(rec.id), { type: str(rec.type), name: str(rec.name) });
    }
    // SERVICE entity names carry a "(...)" suffix (port / controller) that the
    // span service.name lacks — strip it before mapping to a node id.
    const serviceNodeId = (name: string): string => {
      const base = name.replace(/\s*\(.*\)\s*$/, "");
      return /frontend/i.test(base) ? `fe:${shortService(base)}` : `svc:${shortService(base)}`;
    };
    const out: StructuralEdge[] = [];
    for (const r of edgesRes.data?.records ?? []) {
      const rec = r as Record<string, unknown>;
      const s = nodeById.get(str(rec.source_id));
      const t = nodeById.get(str(rec.target_id));
      if (!s || !t) continue;
      if (s.type === "GENAI_AGENT" && t.type === "GENAI_SERVICE") {
        out.push({ source: `agent:${s.name}`, target: `svc:${shortService(t.name)}` });
      } else if (s.type === "GENAI_SERVICE" && t.type === "GENAI_MODEL") {
        out.push({ source: `svc:${shortService(s.name)}`, target: `inf:${t.name}` });
      } else if (s.type === "SERVICE" && t.type === "SERVICE") {
        out.push({ source: serviceNodeId(s.name), target: serviceNodeId(t.name) });
      }
    }
    return out;
  }, [nodesRes.data, edgesRes.data]);

  return { structuralEdges, isLoading: nodesRes.isLoading || edgesRes.isLoading };
}

export interface AgentApp {
  prefix: string;
  label: string;
}

/** Group GenAI service names into selectable agent applications by prefix. */
function deriveApps(serviceNames: string[]): AgentApp[] {
  const roots = new Set<string>();
  for (const name of serviceNames) {
    if (!name) continue;
    const ai = name.indexOf("-agent");
    if (ai > 0) roots.add(name.slice(0, ai));
    else if (name.endsWith("-service")) roots.add(name.slice(0, -"-service".length));
    else roots.add(name);
  }
  // Merge roots so a shorter prefix (e.g. "smartfreight") absorbs its longer
  // siblings ("smartfreight-tms").
  const sorted = [...roots].sort((a, b) => a.length - b.length);
  const kept: string[] = [];
  for (const r of sorted) {
    if (!kept.some((k) => r === k || r.startsWith(`${k}-`))) kept.push(r);
  }
  return kept
    .sort((a, b) => a.localeCompare(b))
    .map((prefix) => ({ prefix, label: prefix }));
}

export function useAgentApps(): { apps: AgentApp[]; isLoading: boolean } {
  const { data, isLoading } = useDql({ query: agentAppsQuery() });
  const apps = useMemo(() => {
    const names = (data?.records ?? []).map((r) => {
      const v = (r as Record<string, unknown>)["service.name"];
      return typeof v === "string" ? v : "";
    });
    const derived = deriveApps(names);
    // Keep the default agent first if present.
    return derived.sort((a, b) =>
      a.prefix === AGENT_SERVICE_PREFIX ? -1 : b.prefix === AGENT_SERVICE_PREFIX ? 1 : 0,
    );
  }, [data]);
  return { apps, isLoading };
}

export function useSessions(
  prefix?: string,
  from?: string,
): {
  sessions: SessionSummary[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
} {
  const { data, isLoading, error, refetch } = useDql({ query: sessionListQuery(prefix, from) });
  const sessions = useMemo(
    () => (data?.records ? buildSessionSummaries(data.records) : []),
    [data],
  );
  return {
    sessions,
    isLoading,
    error: error ?? null,
    refetch: () => {
      void refetch();
    },
  };
}

export interface OverviewData {
  graph: TopologyGraph | null;
  byId: Map<string, ReplaySpan>;
  sessionCount: number;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Aggregate topology across the most recent sessions, for the overview heatmap.
 * Scopes the span fetch by the recent sessions' trace ids so downstream
 * services (not `smartfreight`-prefixed) are included.
 */
export function useOverview(prefix?: string, from?: string, maxSessions = 40): OverviewData {
  const { sessions, isLoading: sLoading, error: sError } = useSessions(prefix, from);

  const top = useMemo(
    () => [...sessions].sort((a, b) => b.start - a.start).slice(0, maxSessions),
    [sessions, maxSessions],
  );

  const query = useMemo(() => {
    if (!top.length) {
      return `fetch spans, from: now()-1m | filter span.id == "" | fields x = span.id | limit 1`;
    }
    const from = new Date(Math.min(...top.map((s) => s.start)) - 5000).toISOString();
    const to = new Date(Math.max(...top.map((s) => s.end)) + 5000).toISOString();
    return overviewSpansQuery(
      top.map((s) => s.traceId),
      { from, to },
    );
  }, [top]);

  const { data, isLoading, error } = useDql({ query });

  const { structuralEdges } = useSmartscapeStructure();

  const spans = useMemo(
    () => (data?.records ? buildTraceModel("overview", data.records).spans : []),
    [data],
  );
  const graph = useMemo(
    () => (spans.length ? buildTopology(spans, structuralEdges) : null),
    [spans, structuralEdges],
  );
  const byId = useMemo(() => new Map(spans.map((s) => [s.spanId, s])), [spans]);

  return {
    graph,
    byId,
    sessionCount: top.length,
    isLoading: sLoading || isLoading,
    error: sError ?? error ?? null,
  };
}

export function useTraceModel(
  traceId: string,
  tf?: Timeframe,
): { model: TraceModel | null; isLoading: boolean; error: Error | null } {
  const { data, isLoading, error } = useDql({ query: traceDetailQuery(traceId, tf) });
  const model = useMemo(
    () => (data?.records ? buildTraceModel(traceId, data.records) : null),
    [data, traceId],
  );
  return { model, isLoading, error: error ?? null };
}
