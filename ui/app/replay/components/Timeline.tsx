import React, { useRef } from "react";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import type { TraceModel, ReplaySpan, SpanKind } from "../types";
import type { TimeMapping } from "../timeMapping";
import { providerColor } from "../palette";
import { fmtDuration } from "../format";

const LANE_LABEL_W = 128;
const LANE_H = 26;
const BAR_H = 13;

interface Props {
  model: TraceModel;
  mapping: TimeMapping;
  displayTime: number;
  onSeekDisplay: (displayMs: number) => void;
  selectedSpanId: string | null;
  onSelect: (spanId: string) => void;
}

function barColor(span: ReplaySpan): { fill: string; opacity: number } {
  const kindColors: Partial<Record<SpanKind, string>> = {
    tool: "#D4537E",
    delegation: "#7F77DD",
  };
  if (span.kind === "llm") return { fill: providerColor(span.provider), opacity: 1 };
  if (kindColors[span.kind]) return { fill: kindColors[span.kind]!, opacity: 0.95 };
  if (span.kind === "agent" || span.kind === "workflow")
    return { fill: Colors.Text.Neutral.Subdued, opacity: 0.14 };
  return { fill: Colors.Text.Neutral.Subdued, opacity: 0.28 };
}

export const Timeline = ({
  model,
  mapping,
  displayTime,
  onSeekDisplay,
  selectedSpanId,
  onSelect,
}: Props) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const dur = mapping.displayDuration || 1;

  const toPct = (displayMs: number) => (displayMs / dur) * 100;
  const spanD0 = (s: ReplaySpan) => mapping.toDisplay(s.start - model.start);
  const spanD1 = (s: ReplaySpan) => mapping.toDisplay(s.end - model.start);

  const seekFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    onSeekDisplay(frac * dur);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    seekFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (draggingRef.current) seekFromClientX(e.clientX);
  };
  const onPointerUp = () => {
    draggingRef.current = false;
  };

  const playheadPct = toPct(displayTime);

  return (
    <div
      style={{
        border: `1px solid ${Colors.Border.Neutral.Default}`,
        borderRadius: 8,
        background: Colors.Background.Surface.Default,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex" }}>
        {/* Lane labels */}
        <div style={{ width: LANE_LABEL_W, flexShrink: 0, borderRight: `1px solid ${Colors.Border.Neutral.Default}` }}>
          <div style={{ height: 18 }} />
          {model.lanes.map((lane) => (
            <div
              key={lane.id}
              style={{
                height: LANE_H,
                display: "flex",
                alignItems: "center",
                paddingLeft: 12,
                fontSize: 12,
                color: Colors.Text.Neutral.Default,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={lane.label}
            >
              {lane.label}
            </div>
          ))}
        </div>

        {/* Track */}
        <div
          ref={trackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ position: "relative", flex: 1, cursor: "pointer", userSelect: "none" }}
        >
          {/* marker axis */}
          <div style={{ position: "relative", height: 18 }}>
            {model.markers.map((m, i) => {
              const pct = toPct(mapping.toDisplay(m.time - model.start));
              const color = m.kind === "error" ? "#E24B4A" : "#EF9F27";
              return (
                <Tooltip key={i} text={m.label}>
                  <div
                    style={{
                      position: "absolute",
                      left: `${pct}%`,
                      top: 2,
                      width: 0,
                      height: 14,
                      borderLeft: `2px solid ${color}`,
                    }}
                  />
                </Tooltip>
              );
            })}
          </div>

          {/* compressed (skipped) regions */}
          {mapping.compressedRegions.map((r, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${toPct(r.d0)}%`,
                width: `${toPct(r.d1 - r.d0)}%`,
                top: 18,
                bottom: 0,
                background:
                  "repeating-linear-gradient(45deg, rgba(136,135,128,0.10) 0 4px, rgba(136,135,128,0) 4px 8px)",
                pointerEvents: "none",
              }}
            />
          ))}

          {/* lane rows */}
          {model.lanes.map((lane) => {
            const spans = model.spans.filter((s) => s.lane === lane.id);
            return (
              <div key={lane.id} style={{ position: "relative", height: LANE_H }}>
                {spans.map((s) => {
                  const d0 = spanD0(s);
                  const d1 = spanD1(s);
                  const left = toPct(d0);
                  const width = Math.max(toPct(d1 - d0), 0.4);
                  const { fill, opacity } = barColor(s);
                  const selected = s.spanId === selectedSpanId;
                  return (
                    <Tooltip key={s.spanId} text={`${s.name} · ${fmtDuration(s.durationMs)}`}>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(s.spanId);
                        }}
                        style={{
                          position: "absolute",
                          left: `${left}%`,
                          width: `${width}%`,
                          top: (LANE_H - BAR_H) / 2,
                          height: BAR_H,
                          background: fill,
                          opacity,
                          borderRadius: 3,
                          boxShadow: selected ? `0 0 0 2px ${Colors.Border.Primary.Accent}` : undefined,
                          cursor: "pointer",
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </div>
            );
          })}

          {/* playhead */}
          <div
            style={{
              position: "absolute",
              left: `${playheadPct}%`,
              top: 0,
              bottom: 0,
              width: 2,
              background: Colors.Border.Primary.Accent,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 2,
                left: -5,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: Colors.Border.Primary.Accent,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
