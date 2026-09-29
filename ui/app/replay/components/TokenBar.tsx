import React, { useState } from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import Colors from "@dynatrace/strato-design-tokens/colors";
import type { TraceModel, TokenSegment } from "../types";
import { withAlpha } from "../palette";
import { fmtInt } from "../format";

export interface CostView {
  /** USD cost for a segment, or null if the model has no configured price. */
  perSegment: (seg: TokenSegment) => number | null;
  total: number;
}

interface Props {
  model: TraceModel;
  absoluteNow: number;
  selectedSpanId: string | null;
  onSelect: (spanId: string) => void;
  onSeekReal: (realMs: number) => void;
  cost: CostView | null;
}

function reachedFraction(seg: TokenSegment, now: number): number {
  if (now >= seg.end) return 1;
  if (now <= seg.start) return 0;
  return (now - seg.start) / Math.max(1, seg.end - seg.start);
}

const fmtUsd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(v < 1 ? 3 : 2)}`;

export const TokenBar = ({ model, absoluteNow, selectedSpanId, onSelect, onSeekReal, cost }: Props) => {
  const [hover, setHover] = useState<TokenSegment | null>(null);

  const litTokens = model.segments.reduce((a, s) => a + s.tokens * reachedFraction(s, absoluteNow), 0);
  const litCost = cost
    ? model.segments.reduce((a, s) => a + (cost.perSegment(s) ?? 0) * reachedFraction(s, absoluteNow), 0)
    : 0;

  const detail = hover;

  return (
    <Flex flexDirection="column" gap={6}>
      <Flex justifyContent="space-between" alignItems="baseline">
        <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>
          Token spend · {fmtInt(model.totalTokens)} total
          {model.totalCacheReadTokens > 0 ? ` · ${fmtInt(model.totalCacheReadTokens)} cached` : ""}
        </Text>
        <Text style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          {cost ? fmtUsd(litCost) : fmtInt(litTokens)}
          <span style={{ color: Colors.Text.Neutral.Subdued }}>
            {" / "}
            {cost ? fmtUsd(cost.total) : fmtInt(model.totalTokens)}
          </span>
        </Text>
      </Flex>

      <div
        style={{
          display: "flex",
          gap: 1,
          height: 26,
          borderRadius: 6,
          overflow: "hidden",
          border: `1px solid ${Colors.Border.Neutral.Default}`,
          background: Colors.Background.Surface.Default,
        }}
        onMouseLeave={() => setHover(null)}
      >
        {model.segments.map((seg) => {
          const frac = reachedFraction(seg, absoluteNow);
          const selected = seg.spanId === selectedSpanId;
          const cachePct = seg.inTokens > 0 ? Math.min(1, seg.cacheReadTokens / seg.inTokens) : 0;
          return (
            <div
              key={seg.spanId}
              onMouseEnter={() => setHover(seg)}
              onClick={() => {
                onSelect(seg.spanId);
                onSeekReal(seg.start - model.start);
              }}
              style={{
                position: "relative",
                flex: `${seg.tokens} 0 0`,
                minWidth: 3,
                background: withAlpha(seg.color, 0.22),
                cursor: "pointer",
                boxShadow: selected ? `inset 0 0 0 2px ${Colors.Border.Primary.Accent}` : undefined,
              }}
              title={`${seg.label} · ${fmtInt(seg.tokens)} tokens`}
            >
              {/* filled portion as playhead crosses */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${frac * 100}%`,
                  background: seg.color,
                }}
              />
              {/* cache-read indicator (bottom stripe over input share) */}
              {cachePct > 0 && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    width: `${cachePct * 100}%`,
                    height: 4,
                    background:
                      "repeating-linear-gradient(45deg, rgba(255,255,255,0.85) 0 2px, rgba(255,255,255,0) 2px 4px)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ minHeight: 18 }}>
        {detail ? (
          <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
            <span style={{ color: Colors.Text.Neutral.Default }}>{detail.label}</span>
            {" · "}
            {detail.agent}
            {" · "}
            {fmtInt(detail.inTokens)} in / {fmtInt(detail.outTokens)} out
            {detail.cacheReadTokens > 0 ? ` · ${fmtInt(detail.cacheReadTokens)} cached` : ""}
            {cost && cost.perSegment(detail) !== null ? ` · ${fmtUsd(cost.perSegment(detail)!)}` : ""}
          </Text>
        ) : (
          <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
            Hover a segment for call detail · click to jump the scrubber there
          </Text>
        )}
      </div>
    </Flex>
  );
};
