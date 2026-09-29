import React, { useMemo } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { ReplaySpan, TraceModel } from "../types";
import { withAlpha } from "../palette";
import {
  buildTopology,
  layoutTopology,
  TIER_ICON,
  WIDTH,
  R,
  type GraphNode,
} from "../topologyGraph";
import { useSmartscapeStructure } from "../useTraceModel";

interface Props {
  model: TraceModel;
  absoluteNow: number;
  selectedSpanId: string | null;
  onSelect: (spanId: string) => void;
}

export const Topology = ({ model, absoluteNow, selectedSpanId, onSelect }: Props) => {
  const { structuralEdges } = useSmartscapeStructure();
  const graph = useMemo(
    () => buildTopology(model.spans, structuralEdges),
    [model, structuralEdges],
  );
  const { pos, height } = useMemo(() => layoutTopology(graph.nodes, graph.totalRows), [graph]);

  const activeSpanIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of model.spans) if (s.start <= absoluteNow && absoluteNow <= s.end) set.add(s.spanId);
    return set;
  }, [model, absoluteNow]);

  const selectedNode = selectedSpanId
    ? graph.nodes.find((n) => n.spanIds.includes(selectedSpanId))?.id
    : undefined;

  const selectNode = (n: GraphNode) => {
    let best: ReplaySpan | undefined;
    for (const id of n.spanIds) {
      const s = model.spans.find((x) => x.spanId === id);
      if (s && (!best || s.start < best.start)) best = s;
    }
    if (best) onSelect(best.spanId);
  };

  return (
    <div
      style={{
        border: `1px solid ${Colors.Border.Neutral.Default}`,
        borderRadius: 8,
        background: Colors.Background.Surface.Default,
        height: "100%",
        padding: 8,
        boxSizing: "border-box",
      }}
    >
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Agent topology by tier"
      >
        <defs>
          {(
            [
              ["arrow-on", Colors.Border.Primary.Accent],
              ["arrow-off", Colors.Border.Neutral.Default],
            ] as const
          ).map(([id, fill]) => (
            <marker
              key={id}
              id={id}
              viewBox="0 0 12 12"
              refX={10}
              refY={6}
              markerWidth={9}
              markerHeight={9}
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M0,0 L12,6 L0,12 z" fill={fill} />
            </marker>
          ))}
        </defs>

        {/* edges: stop at the circle boundary and point an arrow into the target */}
        {graph.edges.map((e) => {
          const s = pos.get(e.source);
          const t = pos.get(e.target);
          if (!s || !t) return null;
          const on = e.spanIds.some((id) => activeSpanIds.has(id));
          const color = on ? Colors.Border.Primary.Accent : Colors.Border.Neutral.Default;
          const vertical = Math.abs(t.y - s.y) > 1;
          const gap = R + 5;
          let sx = s.x;
          let sy = s.y;
          let tx = t.x;
          let ty = t.y;
          if (vertical) {
            const down = t.y >= s.y;
            sy = s.y + (down ? R : -R);
            ty = t.y + (down ? -gap : gap);
          } else {
            const right = t.x >= s.x;
            sx = s.x + (right ? R : -R);
            tx = t.x + (right ? -gap : gap);
          }
          const midY = (sy + ty) / 2;
          const d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;
          return (
            <path
              key={e.id}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={on ? 2.5 : 1.25}
              opacity={on ? 1 : 0.7}
              markerEnd={`url(#${on ? "arrow-on" : "arrow-off"})`}
            />
          );
        })}

        {/* nodes as circles */}
        {graph.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const on = n.spanIds.some((id) => activeSpanIds.has(id));
          const selected = n.id === selectedNode;
          const ring = on || selected ? n.color : Colors.Border.Neutral.Default;
          const Icon = TIER_ICON[n.tier];
          return (
            <g key={n.id} onClick={() => selectNode(n)} style={{ cursor: "pointer" }}>
              <circle
                cx={p.x}
                cy={p.y}
                r={R}
                fill={on ? withAlpha(n.color, 0.22) : Colors.Background.Container.Neutral.Default}
                stroke={ring}
                strokeWidth={on || selected ? 3 : 1.5}
              />
              <foreignObject x={p.x - 13} y={p.y - 13} width={26} height={26} style={{ pointerEvents: "none" }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: n.color,
                    fontSize: 19,
                  }}
                >
                  <Icon />
                </div>
              </foreignObject>
              <text x={p.x} y={p.y + R + 15} textAnchor="middle" fontSize={12} fill={Colors.Text.Neutral.Default}>
                {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};
