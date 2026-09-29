import { useCallback, useEffect, useRef, useState } from "react";

export interface ReplayClock {
  /** Current position in display-time milliseconds. */
  displayTime: number;
  playing: boolean;
  speed: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Seek to an absolute display-time position (clamped). */
  seek: (displayMs: number) => void;
  setSpeed: (speed: number) => void;
}

/**
 * Drives playback in display-time space. A requestAnimationFrame loop advances
 * the position while playing; reaching the end pauses at the end.
 */
export function useReplayClock(displayDuration: number): ReplayClock {
  const [displayTime, setDisplayTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const durationRef = useRef(displayDuration);
  const speedRef = useRef(speed);
  durationRef.current = displayDuration;
  speedRef.current = speed;

  // Keep the playhead within bounds when the duration changes (e.g. skip toggle).
  useEffect(() => {
    setDisplayTime((t) => Math.min(t, displayDuration));
  }, [displayDuration]);

  useEffect(() => {
    if (!playing) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
      return;
    }
    const tick = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) * speedRef.current;
      lastTsRef.current = ts;
      setDisplayTime((prev) => {
        const next = prev + dt;
        if (next >= durationRef.current) {
          setPlaying(false);
          return durationRef.current;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing]);

  const play = useCallback(() => {
    setDisplayTime((t) => (t >= durationRef.current ? 0 : t));
    setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => {
    setPlaying((p) => {
      if (!p) setDisplayTime((t) => (t >= durationRef.current ? 0 : t));
      return !p;
    });
  }, []);
  const seek = useCallback((displayMs: number) => {
    setDisplayTime(Math.max(0, Math.min(durationRef.current, displayMs)));
  }, []);
  const setSpeed = useCallback((s: number) => setSpeedState(s), []);

  return { displayTime, playing, speed, play, pause, toggle, seek, setSpeed };
}
