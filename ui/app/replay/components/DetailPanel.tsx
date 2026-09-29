import React from "react";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip } from "@dynatrace/strato-components/content";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { CopyIcon } from "@dynatrace/strato-icons";
import type { ChatMessage, ReplaySpan, TraceModel } from "../types";
import { fmtDuration, fmtInt } from "../format";

interface Props {
  model: TraceModel;
  span: ReplaySpan | null;
  absoluteNow: number;
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <Flex justifyContent="space-between" gap={12} style={{ padding: "3px 0" }}>
    <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>{label}</Text>
    <Text style={{ fontSize: 12, textAlign: "right" }}>{value}</Text>
  </Flex>
);

const Messages = ({ title, messages }: { title: string; messages: ChatMessage[] }) => (
  <Flex flexDirection="column" gap={4}>
    <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>{title}</Text>
    {messages.map((m, i) => (
      <div
        key={i}
        style={{
          border: `1px solid ${Colors.Border.Neutral.Default}`,
          borderRadius: 6,
          background: Colors.Background.Container.Neutral.Default,
          padding: "6px 8px",
        }}
      >
        <Text style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued, textTransform: "uppercase" }}>
          {m.role}
        </Text>
        <div
          style={{
            marginTop: 2,
            maxHeight: 160,
            overflowY: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {m.text}
        </div>
      </div>
    ))}
  </Flex>
);

export const DetailPanel = ({ model, span, absoluteNow }: Props) => {
  const activeCount = model.spans.filter((s) => s.start <= absoluteNow && absoluteNow <= s.end).length;

  return (
    <Flex
      flexDirection="column"
      gap={8}
      padding={16}
      style={{
        border: `1px solid ${Colors.Border.Neutral.Default}`,
        borderRadius: 8,
        background: Colors.Background.Surface.Default,
        minHeight: 200,
      }}
    >
      {!span ? (
        <Flex flexDirection="column" gap={6}>
          <Heading level={5}>No span selected</Heading>
          <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 12 }}>
            Click a bar, token segment or topology node to inspect it. {activeCount} span
            {activeCount === 1 ? "" : "s"} active at the playhead.
          </Text>
        </Flex>
      ) : (
        <>
          <Flex alignItems="center" gap={8} style={{ flexWrap: "wrap" }}>
            <Heading level={5} style={{ margin: 0 }}>
              {span.name}
            </Heading>
            <Chip color={span.isError ? "critical" : "neutral"}>{span.kind}</Chip>
          </Flex>

          <div>
            <Row label="Agent / lane" value={span.lane} />
            {span.service && <Row label="Service" value={span.service} />}
            {span.op && <Row label="Operation" value={span.op} />}
            {span.tool && <Row label="Tool" value={span.tool} />}
            {(span.model || span.provider) && (
              <Row label="Model" value={`${span.model ?? "—"}${span.provider ? ` (${span.provider})` : ""}`} />
            )}
            {(span.inTokens !== null || span.outTokens !== null) && (
              <Row
                label="Tokens"
                value={`${fmtInt(span.inTokens ?? 0)} in / ${fmtInt(span.outTokens ?? 0)} out${
                  span.cacheReadTokens ? ` · ${fmtInt(span.cacheReadTokens)} cached` : ""
                }`}
              />
            )}
            <Row label="Duration" value={fmtDuration(span.durationMs)} />
            <Row
              label="Status"
              value={
                <span style={{ color: span.isError ? Colors.Text.Critical.Default : undefined }}>
                  {span.status ?? "ok"}
                </span>
              }
            />
            {span.finishReasons && span.finishReasons.length > 0 && (
              <Row label="Finish" value={span.finishReasons.join(", ")} />
            )}
          </div>

          {span.inputMessages && <Messages title="Prompt" messages={span.inputMessages} />}
          {span.outputMessages && <Messages title="Response" messages={span.outputMessages} />}

          <Flex justifyContent="flex-end" style={{ marginTop: 4 }}>
            <Button
              onClick={() => void navigator.clipboard?.writeText(model.traceId)}
              aria-label="Copy trace id"
            >
              <Button.Prefix>
                <CopyIcon />
              </Button.Prefix>
              Copy trace ID
            </Button>
          </Flex>
        </>
      )}
    </Flex>
  );
};
