/**
 * Piecewise-linear mapping between real trace time and displayed time.
 *
 * When "skip thinking" is on, long LLM ("thinking") spans and fully idle gaps
 * are compressed so the scrubber glides over them and dwells on real actions.
 * All times are milliseconds measured from the trace start.
 */

import type { TraceModel } from "./types";

interface Segment {
  r0: number;
  r1: number;
  d0: number;
  d1: number;
}

export interface TimeMapping {
  realDuration: number;
  displayDuration: number;
  toDisplay: (real: number) => number;
  toReal: (display: number) => number;
  /** Compressed spans in display space, for rendering a "skipped" hatch. */
  compressedRegions: { d0: number; d1: number }[];
}

export interface SkipOptions {
  skipThinking: boolean;
  thinkingThresholdMs?: number;
  factor?: number;
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    if (sorted[i][0] <= last[1]) last[1] = Math.max(last[1], sorted[i][1]);
    else out.push(sorted[i]);
  }
  return out;
}

export function buildTimeMapping(model: TraceModel | null, opts: SkipOptions): TimeMapping {
  const realDuration = model?.durationMs ?? 0;
  const identity: TimeMapping = {
    realDuration,
    displayDuration: realDuration,
    toDisplay: (r) => r,
    toReal: (d) => d,
    compressedRegions: [],
  };
  if (!model || realDuration <= 0 || !opts.skipThinking) return identity;

  const threshold = opts.thinkingThresholdMs ?? 1500;
  const factor = opts.factor ?? 0.06;
  const traceStart = model.start;

  // Compressible: the tail of long LLM spans + fully idle gaps.
  const compress: [number, number][] = [];
  for (const s of model.spans) {
    if (s.kind === "llm" && s.durationMs > threshold) {
      compress.push([s.start - traceStart + threshold, s.end - traceStart]);
    }
  }

  // Idle gaps: time when no span at all is running.
  const active: [number, number][] = model.spans
    .map((s) => [s.start - traceStart, s.end - traceStart] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let coveredTo = 0;
  for (const [a0, a1] of active) {
    if (a0 > coveredTo + threshold) compress.push([coveredTo, a0]);
    coveredTo = Math.max(coveredTo, a1);
  }

  const merged = mergeIntervals(compress).filter(([a, b]) => b - a > 1);
  if (!merged.length) return identity;

  // Build segments across [0, realDuration].
  const segments: Segment[] = [];
  const compressedRegions: { d0: number; d1: number }[] = [];
  let cursorR = 0;
  let cursorD = 0;
  for (const [c0, c1] of merged) {
    if (c0 > cursorR) {
      const len = c0 - cursorR;
      segments.push({ r0: cursorR, r1: c0, d0: cursorD, d1: cursorD + len });
      cursorD += len;
      cursorR = c0;
    }
    const clen = (c1 - c0) * factor;
    segments.push({ r0: c0, r1: c1, d0: cursorD, d1: cursorD + clen });
    compressedRegions.push({ d0: cursorD, d1: cursorD + clen });
    cursorD += clen;
    cursorR = c1;
  }
  if (cursorR < realDuration) {
    const len = realDuration - cursorR;
    segments.push({ r0: cursorR, r1: realDuration, d0: cursorD, d1: cursorD + len });
    cursorD += len;
  }
  const displayDuration = cursorD;

  const toDisplay = (real: number): number => {
    const r = Math.max(0, Math.min(realDuration, real));
    for (const s of segments) {
      if (r >= s.r0 && r <= s.r1) {
        const span = s.r1 - s.r0;
        return span === 0 ? s.d0 : s.d0 + ((r - s.r0) / span) * (s.d1 - s.d0);
      }
    }
    return displayDuration;
  };
  const toReal = (display: number): number => {
    const d = Math.max(0, Math.min(displayDuration, display));
    for (const s of segments) {
      if (d >= s.d0 && d <= s.d1) {
        const span = s.d1 - s.d0;
        return span === 0 ? s.r0 : s.r0 + ((d - s.d0) / span) * (s.r1 - s.r0);
      }
    }
    return realDuration;
  };

  return { realDuration, displayDuration, toDisplay, toReal, compressedRegions };
}
