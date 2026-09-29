# AI Agent Replay

A Dynatrace App that turns GenAI/agent spans in Grail into a **scrubbable session replay**
— a Gen3-session-replay-style view for AI agents.

Pick an agent session and replay its trajectory: a **timeline** of agent/LLM/tool spans you can
drag like a video, a live **Smartscape-style topology** that lights up the active call, and a
**token-spend bar** that fills as the playhead advances — each segment colored by the provider
that burned the tokens.

## Features

- **Session picker** — recent agent sessions (traces) with duration, agents, LLM calls and token totals.
- **Scrubbable timeline** — one swimlane per agent, provider-colored span bars, draggable playhead,
  play/pause, 0.5–4× speed, and keyboard control (`Space` play/pause, `←`/`→` step action-to-action).
- **Skip thinking** — compresses long LLM "thinking" spans and idle gaps so the scrubber glides
  over them and dwells on real actions.
- **Token spend bar** — total-token bar segmented per LLM call, filling in sync with the scrubber;
  hover for call detail, click to jump the scrubber there. Cache-read tokens shown as a hatch.
- **Topology** — agent → model / delegation graph derived from the span tree; the active node and
  edge highlight as playback moves.
- **Detail panel** — inspect any selected span (model, tokens, duration, status, finish reasons).
- **Cost ($) overlay** — estimated USD from token counts × per-model rates (see `ui/app/replay/cost.ts`).
- **Diagnostics** — error / guardrail markers on the timeline and repeated-tool-call loop warnings.

## Data model

Everything is derived from `fetch spans` in Grail (no custom ingest). The service under
observation is matched by the `smartfreight` service-name prefix — change
`AGENT_SERVICE_PREFIX` in [`ui/app/replay/queries.ts`](ui/app/replay/queries.ts) to point at a
different agent. Sessions are grouped by `trace.id`; when `gen_ai.conversation.id` is populated
the model is ready to stitch multi-turn sessions.

## Requirements

- **Node.js 24** (see `.nvmrc`). The toolchain uses Vite 8, which needs a modern Node —
  older versions fail with an `ERR_REQUIRE_ESM` error.
  ```bash
  nvm use
  ```

## Available scripts

- `npm run start` — dev server with hot reload (opens an SSO-authenticated browser tab).
- `npm run build` — production bundle to `dist/`.
- `npm run deploy` — deploy to the environment in `app.config.json`.
- `npm run lint` — ESLint.

## Configuration

- Target environment: set `environmentUrl` in [`app.config.json`](app.config.json) to your Dynatrace tenant (`https://<your-tenant>.apps.dynatrace.com/`).
- Required scopes (already set): `storage:spans:read`, `storage:bizevents:read`,
  `storage:entities:read`, `storage:buckets:read`, `state:app-states:read/write`.
