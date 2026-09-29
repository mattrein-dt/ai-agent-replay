import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Flex } from "@dynatrace/strato-components/layouts";
import { Text } from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { ToggleButtonGroup } from "@dynatrace/strato-components/forms";
import { Menu } from "@dynatrace/strato-components/navigation";
import Colors from "@dynatrace/strato-design-tokens/colors";
import { ClockIcon, ChevronDownIcon, AgentIcon } from "@dynatrace/strato-icons";
import { Overview } from "./Overview";
import { Sessions } from "./Sessions";
import { DEFAULT_TIMEFRAME_KEY, TIMEFRAMES, timeframeFrom } from "../replay/timeframes";
import { useAgentApps } from "../replay/useTraceModel";
import { AGENT_SERVICE_PREFIX } from "../replay/queries";

const TABS = [
  { path: "/", label: "Overview" },
  { path: "/sessions", label: "Sessions" },
];

export const Workspace = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.path === location.pathname));

  const [timeframeKey, setTimeframeKey] = useState<string>(DEFAULT_TIMEFRAME_KEY);
  const from = timeframeFrom(timeframeKey);

  const { apps } = useAgentApps();
  const [scope, setScope] = useState<string>(AGENT_SERVICE_PREFIX);
  // Once apps load, fall back to the first available if the default is absent.
  useEffect(() => {
    if (apps.length && !apps.some((a) => a.prefix === scope)) setScope(apps[0].prefix);
  }, [apps, scope]);

  const scopeLabel = apps.find((a) => a.prefix === scope)?.label ?? scope;

  return (
    <div
      style={{
        height: "calc(100vh - 52px)",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      <Flex
        justifyContent="space-between"
        alignItems="flex-end"
        gap={12}
        style={{
          flexShrink: 0,
          padding: "8px 20px 0",
          borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
          flexWrap: "wrap",
        }}
      >
        {/* Tab strip */}
        <Flex gap={4} alignItems="flex-end">
          {TABS.map((t, i) => {
            const active = i === activeIndex;
            return (
              <div
                key={t.path}
                role="tab"
                aria-selected={active}
                onClick={() => navigate(t.path)}
                style={{
                  padding: "8px 14px",
                  cursor: "pointer",
                  fontSize: 14,
                  color: active ? Colors.Text.Neutral.Default : Colors.Text.Neutral.Subdued,
                  borderBottom: `2px solid ${active ? Colors.Border.Primary.Accent : "transparent"}`,
                  marginBottom: -1,
                }}
              >
                {t.label}
              </div>
            );
          })}
        </Flex>

        <Flex alignItems="center" gap={16} style={{ paddingBottom: 6, flexWrap: "wrap" }}>
          {/* Agent application selector */}
          <Flex alignItems="center" gap={8}>
            <AgentIcon />
            <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 13 }}>Agent</Text>
            <Menu>
              <Menu.Trigger>
                <Button variant="default">
                  {scopeLabel}
                  <Button.Suffix>
                    <ChevronDownIcon />
                  </Button.Suffix>
                </Button>
              </Menu.Trigger>
              <Menu.Content>
                {apps.map((a) => (
                  <Menu.Item key={a.prefix} onSelect={() => setScope(a.prefix)}>
                    {a.label}
                  </Menu.Item>
                ))}
              </Menu.Content>
            </Menu>
          </Flex>

          <Flex alignItems="center" gap={8}>
            <ClockIcon />
            <Text style={{ color: Colors.Text.Neutral.Subdued, fontSize: 13 }}>Timeframe</Text>
            <ToggleButtonGroup value={timeframeKey} onChange={(value: string) => setTimeframeKey(value)}>
              {TIMEFRAMES.map((t) => (
                <ToggleButtonGroup.Item key={t.key} value={t.key}>
                  {t.label}
                </ToggleButtonGroup.Item>
              ))}
            </ToggleButtonGroup>
          </Flex>
        </Flex>
      </Flex>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 20px 16px" }}>
        {activeIndex === 1 ? (
          <Sessions scope={scope} from={from} />
        ) : (
          <Overview scope={scope} from={from} />
        )}
      </div>
    </div>
  );
};
