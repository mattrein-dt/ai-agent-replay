import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Switch } from "@dynatrace/strato-components/forms";
import { Tooltip } from "@dynatrace/strato-components/overlays";
import Colors from "@dynatrace/strato-design-tokens/colors";
import {
  PlayIcon,
  PauseIcon,
  ReplayIcon,
  Forward10Icon,
  Backward10Icon,
  ClockIcon,
} from "@dynatrace/strato-icons";
import { fmtClock } from "../format";

const SPEEDS = [0.5, 1, 2, 4];

interface Props {
  playing: boolean;
  onToggle: () => void;
  onReset: () => void;
  onStepPrev: () => void;
  onStepNext: () => void;
  speed: number;
  onSpeed: (s: number) => void;
  skipThinking: boolean;
  onSkip: (v: boolean) => void;
  displayTime: number;
  displayDuration: number;
}

export const PlaybackControls = ({
  playing,
  onToggle,
  onReset,
  onStepPrev,
  onStepNext,
  speed,
  onSpeed,
  skipThinking,
  onSkip,
  displayTime,
  displayDuration,
}: Props) => {
  return (
    <Flex
      alignItems="center"
      gap={12}
      style={{
        border: `1px solid ${Colors.Border.Neutral.Default}`,
        borderRadius: 8,
        background: Colors.Background.Surface.Default,
        flexWrap: "wrap",
        padding: "10px 16px",
      }}
    >
      <Tooltip text="Previous action">
        <Button onClick={onStepPrev} aria-label="Previous action">
          <Button.Prefix>
            <Backward10Icon />
          </Button.Prefix>
        </Button>
      </Tooltip>

      <Button variant="accent" onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        <Button.Prefix>{playing ? <PauseIcon /> : <PlayIcon />}</Button.Prefix>
        {playing ? "Pause" : "Play"}
      </Button>

      <Tooltip text="Next action">
        <Button onClick={onStepNext} aria-label="Next action">
          <Button.Prefix>
            <Forward10Icon />
          </Button.Prefix>
        </Button>
      </Tooltip>

      <Tooltip text="Restart">
        <Button onClick={onReset} aria-label="Restart">
          <Button.Prefix>
            <ReplayIcon />
          </Button.Prefix>
        </Button>
      </Tooltip>

      <Flex alignItems="center" gap={6} style={{ marginLeft: 4 }}>
        <ClockIcon />
        <Text style={{ fontVariantNumeric: "tabular-nums", fontSize: 14 }}>
          {fmtClock(displayTime)} / {fmtClock(displayDuration)}
        </Text>
      </Flex>

      <Flex alignItems="center" gap={4} style={{ marginLeft: 8 }}>
        {SPEEDS.map((s) => (
          <Button
            key={s}
            onClick={() => onSpeed(s)}
            variant={s === speed ? "emphasized" : "default"}
            style={{ minWidth: 44 }}
          >
            {s}×
          </Button>
        ))}
      </Flex>

      <Flex alignItems="center" gap={8} style={{ marginLeft: "auto" }}>
        <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 13 }}>Skip thinking</Text>
        <Switch value={skipThinking} onChange={(checked: boolean) => onSkip(checked)} />
      </Flex>
    </Flex>
  );
};
