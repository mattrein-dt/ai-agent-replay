import React, { useMemo, useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ProgressCircle } from "@dynatrace/strato-components/content";
import { ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { CriticalIcon, ArrowLeftIcon, WarningIcon } from "@dynatrace/strato-icons";
import { Chip } from "@dynatrace/strato-components/content";
import { useOverview } from "../replay/useTraceModel";
import { heatColor } from "../replay/topologyGraph";
import { fmtDuration, fmtInt } from "../replay/format";
import type { ReplaySpan } from "../replay/types";
import { OverviewTopology } from "../replay/components/OverviewTopology";

type Metric = "tokens" | "duration" | "requests" | "lost";

const METRICS: { id: Metric; label: string }[] = [
  { id: "tokens", label: "Tokens" },
  { id: "duration", label: "Duration" },
  { id: "requests", label: "Requests" },
  { id: "lost", label: "Lost tokens" },
];

function contribution(
  span: ReplaySpan | undefined,
  metric: Metric,
  failedTraces: Set<string>,
): number {
  if (!span) return 0;
  const tokens = (span.inTokens ?? 0) + (span.outTokens ?? 0);
  if (metric === "tokens") return tokens;
  if (metric === "duration") return span.durationMs;
  if (metric === "lost") return span.traceId && failedTraces.has(span.traceId) ? tokens : 0;
  return 1; // requests
}

function formatMetric(v: number, metric: Metric): string {
  if (metric === "duration") return fmtDuration(v);
  return fmtInt(v);
}

export const Overview = ({ scope, from }: { scope?: string; from?: string }) => {
  const { graph, byId, sessionCount, isLoading, error } = useOverview(scope, from);
  const [metric, setMetric] = useState<Metric>("tokens");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Failures: traces containing an error span, and the nodes where errors occur.
  const { failedTraceIds, failingNodeIds } = useMemo(() => {
    const failedTraceIds = new Set<string>();
    const failingNodeIds = new Set<string>();
    if (graph) {
      for (const s of byId.values()) {
        if (!s.isError) continue;
        if (s.traceId) failedTraceIds.add(s.traceId);
        const nid = graph.spanNode.get(s.spanId);
        if (nid) failingNodeIds.add(nid);
      }
    }
    return { failedTraceIds, failingNodeIds };
  }, [graph, byId]);

  // Per-span: the node it maps to, and the distinct nodes on its path to root.
  // These let a span's cost back-propagate up to every ancestor node.
  const spanPaths = useMemo(() => {
    const mapped = new Map<string, string>();
    const ancestors = new Map<string, string[]>();
    if (graph) {
      for (const [spanId, nodeId] of graph.spanNode) mapped.set(spanId, nodeId);
      for (const spanId of graph.spanNode.keys()) {
        const path = new Set<string>();
        let cur: ReplaySpan | undefined = byId.get(spanId);
        const seen = new Set<string>();
        while (cur && !seen.has(cur.spanId)) {
          seen.add(cur.spanId);
          const nid = graph.spanNode.get(cur.spanId);
          if (nid) path.add(nid);
          cur = cur.parentId ? byId.get(cur.parentId) : undefined;
        }
        ancestors.set(spanId, [...path]);
      }
    }
    return { mapped, ancestors };
  }, [graph, byId]);

  // Rolled-up node totals (a node carries its whole subtree) + edge flow.
  const { nodeValues, edgeValues, total } = useMemo(() => {
    const nodeValues = new Map<string, number>();
    const edgeValues = new Map<string, number>();
    let total = 0;
    if (graph) {
      for (const [spanId, path] of spanPaths.ancestors) {
        const c = contribution(byId.get(spanId), metric, failedTraceIds);
        if (c === 0) continue;
        total += c;
        for (const nid of path) nodeValues.set(nid, (nodeValues.get(nid) ?? 0) + c);
      }
      for (const e of graph.edges) edgeValues.set(e.id, nodeValues.get(e.target) ?? 0);
    }
    return { nodeValues, edgeValues, total };
  }, [graph, byId, metric, spanPaths, failedTraceIds]);

  // Default drill subject = the highest-rolled-up agent (the supervisor).
  const defaultNodeId = useMemo(() => {
    if (!graph) return null;
    const agents = graph.nodes
      .filter((n) => n.tier === 1)
      .sort((a, b) => (nodeValues.get(b.id) ?? 0) - (nodeValues.get(a.id) ?? 0));
    if (agents[0]) return agents[0].id;
    let best: string | null = null;
    let max = -1;
    for (const [id, v] of nodeValues) {
      if (v > max) {
        max = v;
        best = id;
      }
    }
    return best;
  }, [graph, nodeValues]);

  const subjectId = selectedNodeId ?? defaultNodeId;
  const subject = graph?.nodes.find((n) => n.id === subjectId);

  // Break the subject's rollup into the descendant nodes that make it up.
  const breakdown = useMemo(() => {
    if (!graph || !subjectId) return [];
    const parts = new Map<string, number>();
    for (const [spanId, path] of spanPaths.ancestors) {
      if (!path.includes(subjectId)) continue;
      const c = contribution(byId.get(spanId), metric, failedTraceIds);
      if (c === 0) continue;
      const mapped = spanPaths.mapped.get(spanId);
      if (!mapped) continue;
      parts.set(mapped, (parts.get(mapped) ?? 0) + c);
    }
    return graph.nodes
      .map((n) => ({ node: n, value: parts.get(n.id) ?? 0 }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [graph, byId, metric, spanPaths, subjectId, failedTraceIds]);

  const subjectTotal = subjectId ? nodeValues.get(subjectId) ?? 0 : 0;
  const metricLabel = METRICS.find((m) => m.id === metric)?.label.toLowerCase() ?? "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        paddingBottom: 8,
        boxSizing: "border-box",
      }}
    >
      <Flex alignItems="center" gap={12} style={{ flexWrap: "wrap", flexShrink: 0 }}>
        <Heading level={3} style={{ margin: 0 }}>
          Agentic workflow overview
        </Heading>
        <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>
          rolled-up {metricLabel} across {sessionCount} recent sessions
        </Text>
        {failedTraceIds.size > 0 && (
          <Chip
            color={metric === "lost" ? "critical" : "warning"}
            onClick={() => setMetric("lost")}
          >
            <Chip.Prefix>
              <WarningIcon />
            </Chip.Prefix>
            {failedTraceIds.size} of {sessionCount} sessions failed
          </Chip>
        )}
        <Flex alignItems="center" gap={12} style={{ marginLeft: "auto" }}>
          <ToggleButtonGroup value={metric} onChange={(v: string) => setMetric(v as Metric)}>
            {METRICS.map((m) => (
              <ToggleButtonGroup.Item key={m.id} value={m.id}>
                {m.label}
              </ToggleButtonGroup.Item>
            ))}
          </ToggleButtonGroup>
        </Flex>
      </Flex>

      {isLoading && (
        <Flex alignItems="center" gap={8} padding={32} justifyContent="center">
          <ProgressCircle />
          <Text>Aggregating recent sessions…</Text>
        </Flex>
      )}
      {error && (
        <Flex alignItems="center" gap={8} style={{ color: Colors.Text.Critical.Default }}>
          <CriticalIcon />
          <Text>{error.message}</Text>
        </Flex>
      )}

      {graph && !isLoading && (
        <div style={{ height: "clamp(380px, 64vh, 680px)", display: "flex", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            <OverviewTopology
              graph={graph}
              nodeValues={nodeValues}
              edgeValues={edgeValues}
              failingNodeIds={failingNodeIds}
              formatValue={(v) => formatMetric(v, metric)}
              selectedNodeId={selectedNodeId}
              onSelectNode={(id) => setSelectedNodeId((cur) => (cur === id ? null : id))}
            />
          </div>

          <div
            style={{
              flex: "0 0 320px",
              overflowY: "auto",
              border: `1px solid ${Colors.Border.Neutral.Default}`,
              borderRadius: 8,
              background: Colors.Background.Surface.Default,
              padding: 16,
            }}
          >
            {selectedNodeId && (
              <Button onClick={() => setSelectedNodeId(null)} style={{ marginBottom: 10 }}>
                <Button.Prefix>
                  <ArrowLeftIcon />
                </Button.Prefix>
                Whole workflow
              </Button>
            )}

            <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>
              {subject ? `${subject.label} · total ${metricLabel}` : `Total ${metricLabel}`}
            </Text>
            <Heading level={3} style={{ margin: "2px 0 4px" }}>
              {formatMetric(subjectTotal || total, metric)}
            </Heading>
            <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>
              Breakdown by node · click a node to drill in
            </Text>

            <Flex flexDirection="column" gap={6} style={{ marginTop: 8 }}>
              {breakdown.map(({ node, value }) => {
                const ratio = subjectTotal > 0 ? value / subjectTotal : 0;
                return (
                  <div
                    key={node.id}
                    onClick={() => setSelectedNodeId(node.id)}
                    style={{
                      cursor: "pointer",
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: `1px solid ${Colors.Border.Neutral.Default}`,
                    }}
                  >
                    <Flex justifyContent="space-between" alignItems="baseline" gap={8}>
                      <Text
                        style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {node.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
                        {formatMetric(value, metric)} · {Math.round(ratio * 100)}%
                      </Text>
                    </Flex>
                    <div
                      style={{
                        marginTop: 4,
                        height: 5,
                        borderRadius: 3,
                        width: `${Math.max(ratio * 100, 3)}%`,
                        background: heatColor(ratio),
                      }}
                    />
                  </div>
                );
              })}
              {breakdown.length === 0 && (
                <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>
                  No {metricLabel} recorded here.
                </Text>
              )}
            </Flex>
          </div>
        </div>
      )}
    </div>
  );
};
