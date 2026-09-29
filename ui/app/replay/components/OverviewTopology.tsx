import React, { useMemo } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { withAlpha } from "../palette";
import {
  heatColor,
  layoutTopology,
  TIER_ICON,
  WIDTH,
  R,
  type TopologyGraph,
} from "../topologyGraph";

interface Props {
  graph: TopologyGraph;
  nodeValues: Map<string, number>;
  edgeValues: Map<string, number>;
  /** Nodes where error spans occur, marked with a failure badge. */
  failingNodeIds?: Set<string>;
  formatValue: (v: number) => string;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

const DANGER = "#E24B4A";

export const OverviewTopology = ({
  graph,
  nodeValues,
  edgeValues,
  failingNodeIds,
  formatValue,
  selectedNodeId,
  onSelectNode,
}: Props) => {
  const { pos, height } = useMemo(() => layoutTopology(graph.nodes, graph.totalRows), [graph]);
  const maxNode = useMemo(() => Math.max(1, ...[...nodeValues.values()]), [nodeValues]);
  const maxEdge = useMemo(() => Math.max(1, ...[...edgeValues.values()]), [edgeValues]);

  const radiusOf = (id: string) => {
    const t = (nodeValues.get(id) ?? 0) / maxNode;
    return 14 + 10 * t;
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
        aria-label="Aggregate agent topology heatmap"
      >
        <defs>
          <marker
            id="ov-arrow"
            viewBox="0 0 12 12"
            refX={10}
            refY={6}
            markerWidth={9}
            markerHeight={9}
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0,0 L12,6 L0,12 z" fill="context-stroke" />
          </marker>
        </defs>

        {/* edges weighted + colored by metric */}
        {graph.edges.map((e) => {
          const s = pos.get(e.source);
          const t = pos.get(e.target);
          if (!s || !t) return null;
          const val = edgeValues.get(e.id) ?? 0;
          const ratio = val / maxEdge;
          const color = val > 0 ? heatColor(ratio) : Colors.Border.Neutral.Default;
          const tr = radiusOf(e.target);
          const vertical = Math.abs(t.y - s.y) > 1;
          const gap = tr + 5;
          let sx = s.x;
          let sy = s.y;
          let tx = t.x;
          let ty = t.y;
          if (vertical) {
            const down = t.y >= s.y;
            sy = s.y + (down ? radiusOf(e.source) : -radiusOf(e.source));
            ty = t.y + (down ? -gap : gap);
          } else {
            const right = t.x >= s.x;
            sx = s.x + (right ? radiusOf(e.source) : -radiusOf(e.source));
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
              strokeWidth={1 + 5 * ratio}
              opacity={val > 0 ? 0.9 : 0.5}
              markerEnd="url(#ov-arrow)"
            />
          );
        })}

        {/* nodes heat-colored + sized by metric */}
        {graph.nodes.map((n) => {
          const val = nodeValues.get(n.id) ?? 0;
          const ratio = val / maxNode;
          const p = pos.get(n.id)!;
          const rr = radiusOf(n.id);
          const hot = val > 0;
          const heat = heatColor(ratio);
          const selected = n.id === selectedNodeId;
          const failing = failingNodeIds?.has(n.id) ?? false;
          const ring = selected
            ? Colors.Border.Primary.Accent
            : failing
              ? DANGER
              : hot
                ? heat
                : Colors.Border.Neutral.Default;
          const Icon = TIER_ICON[n.tier];
          const iconBox = rr * 1.1;
          return (
            <g key={n.id} onClick={() => onSelectNode(n.id)} style={{ cursor: "pointer" }}>
              <circle
                cx={p.x}
                cy={p.y}
                r={rr}
                fill={hot ? withAlpha(heat, 0.16 + 0.28 * ratio) : Colors.Background.Container.Neutral.Default}
                stroke={ring}
                strokeWidth={selected ? 3.5 : failing ? 2.5 : hot ? 2 : 1.25}
              />
              <foreignObject
                x={p.x - iconBox / 2}
                y={p.y - iconBox / 2}
                width={iconBox}
                height={iconBox}
                style={{ pointerEvents: "none" }}
              >
                <div
                  style={{
                    width: iconBox,
                    height: iconBox,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: hot ? heat : Colors.Text.Neutral.Subdued,
                    fontSize: rr * 0.8,
                  }}
                >
                  <Icon />
                </div>
              </foreignObject>
              <text x={p.x} y={p.y + R + 14} textAnchor="middle" fontSize={12} fill={Colors.Text.Neutral.Default}>
                {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
              </text>
              {hot && (
                <text
                  x={p.x}
                  y={p.y + R + 28}
                  textAnchor="middle"
                  fontSize={11}
                  fill={Colors.Text.Neutral.Subdued}
                >
                  {formatValue(val)}
                </text>
              )}
              {failing && (
                <>
                  <circle
                    cx={p.x + rr * 0.72}
                    cy={p.y - rr * 0.72}
                    r={8}
                    fill={DANGER}
                    stroke={Colors.Background.Surface.Default}
                    strokeWidth={1.5}
                  />
                  <text
                    x={p.x + rr * 0.72}
                    y={p.y - rr * 0.72 + 4}
                    textAnchor="middle"
                    fontSize={12}
                    fontWeight={700}
                    fill="#ffffff"
                  >
                    !
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
