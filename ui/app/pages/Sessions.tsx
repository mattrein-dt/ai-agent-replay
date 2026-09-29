import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Heading, Paragraph, Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Chip, ProgressCircle } from "@dynatrace/strato-components/content";
import { DataTable, type DataTableColumnDef } from "@dynatrace/strato-components/tables";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { CriticalIcon, RefreshIcon } from "@dynatrace/strato-icons";
import { useSessions } from "../replay/useTraceModel";
import { fmtDuration, fmtInt, fmtTime } from "../replay/format";
import type { SessionSummary } from "../replay/types";

/** Add a small buffer around a trace so the detail query window is generous but cheap. */
function timeframeFor(s: SessionSummary): { from: string; to: string } {
  const pad = 5000;
  return {
    from: new Date(s.start - pad).toISOString(),
    to: new Date(s.end + pad).toISOString(),
  };
}

export const Sessions = ({ scope, from }: { scope?: string; from?: string }) => {
  const navigate = useNavigate();
  const { sessions, isLoading, error, refetch } = useSessions(scope, from);

  const openTrace = (traceId: string) => {
    const s = sessions.find((x) => x.traceId === traceId);
    if (!s) return;
    const tf = timeframeFor(s);
    navigate(`/replay/${traceId}?from=${encodeURIComponent(tf.from)}&to=${encodeURIComponent(tf.to)}`);
  };

  const columns = useMemo<DataTableColumnDef<SessionSummary>[]>(
    () => [
      {
        id: "start",
        header: "Started",
        accessor: "start",
        width: "1.4fr",
        sortType: "number",
        cell: ({ value }) => <Text>{fmtTime(value as number)}</Text>,
      },
      {
        id: "durationMs",
        header: "Duration",
        accessor: "durationMs",
        sortType: "number",
        cell: ({ value }) => <Text>{fmtDuration(value as number)}</Text>,
      },
      { id: "agents", header: "Agents", accessor: "agents", sortType: "number" },
      { id: "llmCalls", header: "LLM calls", accessor: "llmCalls", sortType: "number" },
      { id: "spans", header: "Spans", accessor: "spans", sortType: "number" },
      {
        id: "totalTokens",
        header: "Tokens",
        accessor: "totalTokens",
        sortType: "number",
        cell: ({ value }) => <Text>{fmtInt(value as number)}</Text>,
      },
      {
        id: "errors",
        header: "Errors",
        accessor: "errors",
        sortType: "number",
        cell: ({ value }) =>
          (value as number) > 0 ? (
            <Chip color="critical">
              <Chip.Prefix>
                <CriticalIcon />
              </Chip.Prefix>
              {value as number}
            </Chip>
          ) : (
            <Text style={{ color: Colors.Text.Neutral.Subdued }}>—</Text>
          ),
      },
      {
        id: "traceId",
        header: "Trace",
        accessor: "traceId",
        width: "1.4fr",
        cell: ({ value }) => (
          <Text style={{ fontFamily: "monospace", color: Colors.Text.Neutral.Subdued }}>
            {(value as string).slice(0, 16)}…
          </Text>
        ),
      },
    ],
    [],
  );

  return (
    <Flex flexDirection="column" gap={16} style={{ padding: "12px 0" }}>
      <Flex justifyContent="space-between" alignItems="flex-end">
        <Flex flexDirection="column" gap={4}>
          <Heading level={1}>Agent sessions</Heading>
          <Paragraph style={{ color: Colors.Text.Neutral.Subdued }}>
            Pick a session to replay its agent trajectory, topology and token spend. Click a column
            header to sort.
          </Paragraph>
        </Flex>
        <Button onClick={() => refetch()}>
          <Button.Prefix>
            <RefreshIcon />
          </Button.Prefix>
          Refresh
        </Button>
      </Flex>

      {isLoading && (
        <Flex alignItems="center" gap={8} padding={32} justifyContent="center">
          <ProgressCircle />
          <Text>Loading sessions…</Text>
        </Flex>
      )}

      {error && (
        <Flex alignItems="center" gap={8} style={{ color: Colors.Text.Critical.Default }}>
          <CriticalIcon />
          <Text>{error.message}</Text>
        </Flex>
      )}

      {!isLoading && !error && sessions.length === 0 && (
        <Paragraph>No agent sessions found in the selected timeframe.</Paragraph>
      )}

      {sessions.length > 0 && (
        <DataTable
          data={sessions}
          columns={columns}
          sortable
          fullWidth
          rowId={(row) => row.traceId}
          defaultSortBy={[{ id: "start", desc: true }]}
          interactiveRows={{ autoActivate: false }}
          onActiveRowChange={(activeRow) => {
            if (activeRow) openTrace(activeRow);
          }}
        />
      )}
    </Flex>
  );
};
