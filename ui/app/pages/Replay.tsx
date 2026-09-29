import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip, ProgressCircle } from "@dynatrace/strato-components/content";
import { Switch } from "@dynatrace/strato-components/forms";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { CriticalIcon, WarningIcon, ArrowLeftIcon } from "@dynatrace/strato-icons";
import { useDql } from "@dynatrace-sdk/react-hooks";

import { useTraceModel } from "../replay/useTraceModel";
import { evaluationsQuery } from "../replay/queries";
import { buildTimeMapping } from "../replay/timeMapping";
import { useReplayClock } from "../replay/useReplayClock";
import { buildCostView } from "../replay/cost";
import { PlaybackControls } from "../replay/components/PlaybackControls";
import { TokenBar } from "../replay/components/TokenBar";
import { Timeline } from "../replay/components/Timeline";
import { Topology } from "../replay/components/Topology";
import { DetailPanel } from "../replay/components/DetailPanel";

const ACTION_KINDS = new Set(["llm", "tool", "delegation"]);

export const Replay = () => {
  const { traceId = "" } = useParams();
  const [search] = useSearchParams();
  const from = search.get("from") ?? undefined;
  const to = search.get("to") ?? undefined;
  const tf = from && to ? { from, to } : undefined;

  const { model, isLoading, error } = useTraceModel(traceId, tf);

  const [skipThinking, setSkipThinking] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);

  const mapping = useMemo(() => buildTimeMapping(model, { skipThinking }), [model, skipThinking]);
  const clock = useReplayClock(mapping.displayDuration);

  const realTime = mapping.toReal(clock.displayTime);
  const absoluteNow = (model?.start ?? 0) + realTime;

  const selectedSpan = useMemo(
    () => model?.spans.find((s) => s.spanId === selectedSpanId) ?? null,
    [model, selectedSpanId],
  );

  const costView = useMemo(() => (model && showCost ? buildCostView(model) : null), [model, showCost]);

  // Evaluation bizevents for this trace (optional overlay).
  const evalRes = useDql({ query: evaluationsQuery(traceId, tf) });
  const evals = (evalRes.data?.records as Array<Record<string, unknown>> | undefined) ?? [];

  const actionBreaks = useMemo(() => {
    if (!model) return [] as number[];
    const bs = model.spans
      .filter((s) => ACTION_KINDS.has(s.kind))
      .map((s) => Math.round(mapping.toDisplay(s.start - model.start)));
    return Array.from(new Set(bs)).sort((a, b) => a - b);
  }, [model, mapping]);

  const stepNext = useCallback(() => {
    const next = actionBreaks.find((b) => b > clock.displayTime + 2);
    clock.seek(next ?? mapping.displayDuration);
  }, [actionBreaks, clock, mapping.displayDuration]);
  const stepPrev = useCallback(() => {
    const prev = [...actionBreaks].reverse().find((b) => b < clock.displayTime - 2);
    clock.seek(prev ?? 0);
  }, [actionBreaks, clock]);

  // Keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        clock.toggle();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [clock, stepNext, stepPrev]);

  const onSeekReal = useCallback(
    (realMs: number) => clock.seek(mapping.toDisplay(realMs)),
    [clock, mapping],
  );

  const ready = !!model && model.spans.length > 0;

  return (
    <div
      style={{
        height: "calc(100vh - 52px)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: "10px 20px 14px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      {/* slim nav strip */}
      <Flex alignItems="center" gap={12} style={{ flexWrap: "wrap", flexShrink: 0 }}>
        <Button as={Link} to="/sessions" aria-label="Back to sessions">
          <Button.Prefix>
            <ArrowLeftIcon />
          </Button.Prefix>
          Sessions
        </Button>
        <Heading level={4} style={{ margin: 0 }}>
          Agent replay
        </Heading>
        <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>
          trace {traceId.slice(0, 18)}…
        </Text>
        {evals.map((ev, i) => (
          <Chip key={i} color={String(ev.label) === "fail" ? "critical" : "success"}>
            {String(ev.name)}: {String(ev.label)}
          </Chip>
        ))}
        {ready &&
          model.loopWarnings.map((w, i) => (
            <Flex key={i} alignItems="center" gap={4} style={{ color: Colors.Text.Warning.Default }}>
              <WarningIcon />
              <Text style={{ fontSize: 12 }}>{w}</Text>
            </Flex>
          ))}
        <Flex alignItems="center" gap={8} style={{ marginLeft: "auto" }}>
          <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 13 }}>Show cost ($)</Text>
          <Switch value={showCost} onChange={(c: boolean) => setShowCost(c)} />
        </Flex>
      </Flex>

      {isLoading && (
        <Flex alignItems="center" gap={8} padding={32} justifyContent="center">
          <ProgressCircle />
          <Text>Loading trace…</Text>
        </Flex>
      )}
      {error && (
        <Flex alignItems="center" gap={8} style={{ color: Colors.Text.Critical.Default }}>
          <CriticalIcon />
          <Text>{error.message}</Text>
        </Flex>
      )}
      {!isLoading && !error && model && model.spans.length === 0 && (
        <Paragraph>No spans found for this trace in the selected timeframe.</Paragraph>
      )}

      {ready && (
        <>
          {/* very top: token / spend bar */}
          <div style={{ flexShrink: 0 }}>
            <TokenBar
              model={model}
              absoluteNow={absoluteNow}
              selectedSpanId={selectedSpanId}
              onSelect={setSelectedSpanId}
              onSeekReal={onSeekReal}
              cost={costView}
            />
          </div>

          {/* hero: topology (fills) + detail panel */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
              <Topology
                model={model}
                absoluteNow={absoluteNow}
                selectedSpanId={selectedSpanId}
                onSelect={setSelectedSpanId}
              />
            </div>
            <div style={{ flex: "0 0 320px", overflowY: "auto" }}>
              <DetailPanel model={model} span={selectedSpan} absoluteNow={absoluteNow} />
            </div>
          </div>

          {/* pinned bottom: controls above the timeline */}
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            <PlaybackControls
              playing={clock.playing}
              onToggle={clock.toggle}
              onReset={() => clock.seek(0)}
              onStepPrev={stepPrev}
              onStepNext={stepNext}
              speed={clock.speed}
              onSpeed={clock.setSpeed}
              skipThinking={skipThinking}
              onSkip={setSkipThinking}
              displayTime={clock.displayTime}
              displayDuration={mapping.displayDuration}
            />
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              <Timeline
                model={model}
                mapping={mapping}
                displayTime={clock.displayTime}
                onSeekDisplay={clock.seek}
                selectedSpanId={selectedSpanId}
                onSelect={setSelectedSpanId}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
