/** DQL query builders for the agent-replay app. */

/** Default service-name prefix that identifies the agent under observation. */
export const AGENT_SERVICE_PREFIX = "smartfreight";

export interface Timeframe {
  from: string;
  to: string;
}

const defaultFrom = "now()-24h";

/**
 * Distinct GenAI service names, used to derive the list of selectable agent
 * applications. Uses a wide window so every app appears regardless of the
 * dashboard timeframe.
 */
export function agentAppsQuery(from = "now()-7d"): string {
  return `fetch spans, from: ${from}
| filter isNotNull(gen_ai.agent.name) or isNotNull(gen_ai.request.model)
| filter isNotNull(service.name)
| summarize spans = count(), by: { service.name }
| sort spans desc
| limit 200`;
}

/**
 * Recent agent sessions for the given service-name prefix (a trace counts as a
 * session when it contains any GenAI activity), with summary metrics.
 */
export function sessionListQuery(
  prefix: string = AGENT_SERVICE_PREFIX,
  from: string = defaultFrom,
): string {
  return `fetch spans, from: ${from}
| filter startsWith(service.name, "${prefix}")
| summarize
    start = min(start_time),
    endt = max(start_time + duration),
    spans = count(),
    llm = countIf(isNotNull(gen_ai.usage.input_tokens)),
    agents = countDistinct(gen_ai.agent.name),
    in_tok = sum(gen_ai.usage.input_tokens),
    out_tok = sum(gen_ai.usage.output_tokens),
    errors = countIf(span.status_code == "error"),
    by: { trace.id }
| filter llm > 0 or agents > 0
| fieldsAdd duration_ms = (endt - start) / 1ms
| sort start desc
| limit 200`;
}

/** Smartscape entities used to build the authoritative topology structure. */
export function smartscapeNodesQuery(): string {
  return `smartscapeNodes "GENAI_AGENT", "GENAI_MODEL", "GENAI_SERVICE", "SERVICE"
| fields id, type, name
| limit 3000`;
}

/**
 * Smartscape relationships that define the topology structure:
 * - GENAI_AGENT is_part_of GENAI_SERVICE  (agent → service)
 * - GENAI_SERVICE uses GENAI_MODEL        (service → model)
 * - SERVICE calls SERVICE                 (frontend → service, service → service
 *                                          delegation, service → downstream API)
 * Agent → model `uses` edges are excluded so inference routes through services.
 */
export function smartscapeEdgesQuery(): string {
  return `smartscapeEdges "*"
| filter (source_type == "GENAI_AGENT" and type == "is_part_of" and target_type == "GENAI_SERVICE")
    or (source_type == "GENAI_SERVICE" and type == "uses" and target_type == "GENAI_MODEL")
    or (source_type == "SERVICE" and type == "calls" and target_type == "SERVICE")
| fields source_id, target_id, type, source_type, target_type
| limit 5000`;
}

/** All spans for a single trace, projected to the fields the model builder uses. */
export function traceDetailQuery(traceIdHex: string, tf?: Timeframe): string {
  const window = tf ? `, from: "${tf.from}", to: "${tf.to}"` : `, from: ${defaultFrom}`;
  return `fetch spans${window}
| filter trace.id == toUid("${traceIdHex}")
| fields
    span_id = span.id,
    parent_id = span.parent_id,
    name = span.name,
    service = service.name,
    start = start_time,
    duration_ms = duration / 1ms,
    op = gen_ai.operation.name,
    agent = gen_ai.agent.name,
    model = gen_ai.request.model,
    provider = gen_ai.provider.name,
    tool = gen_ai.tool.name,
    in_tok = gen_ai.usage.input_tokens,
    out_tok = gen_ai.usage.output_tokens,
    cache_read = gen_ai.usage.cache_read.input_tokens,
    status = span.status_code,
    finish = gen_ai.response.finish_reasons,
    input_msgs = gen_ai.input.messages,
    output_msgs = gen_ai.output.messages
| sort start asc
| limit 5000`;
}

/**
 * All spans (every service, including downstream dependencies) for a set of
 * sessions, used to build the aggregate overview topology. Scoped by trace id
 * so non-`smartfreight` downstream services (e.g. tms-api) are included.
 */
export function overviewSpansQuery(traceIds: string[], tf: Timeframe): string {
  const list = traceIds.map((id) => `"${id}"`).join(", ");
  return `fetch spans, from: "${tf.from}", to: "${tf.to}"
| filter in(toString(trace.id), ${list})
| fields
    span_id = span.id,
    parent_id = span.parent_id,
    trace_id = toString(trace.id),
    name = span.name,
    service = service.name,
    start = start_time,
    duration_ms = duration / 1ms,
    op = gen_ai.operation.name,
    agent = gen_ai.agent.name,
    model = gen_ai.request.model,
    provider = gen_ai.provider.name,
    tool = gen_ai.tool.name,
    in_tok = gen_ai.usage.input_tokens,
    out_tok = gen_ai.usage.output_tokens,
    cache_read = gen_ai.usage.cache_read.input_tokens,
    status = span.status_code,
    finish = gen_ai.response.finish_reasons
| limit 25000`;
}

/** Evaluation results (bizevents) tied to a trace, for the quality overlay. */
export function evaluationsQuery(traceIdHex: string, tf?: Timeframe): string {
  const window = tf ? `, from: "${tf.from}", to: "${tf.to}"` : `, from: ${defaultFrom}`;
  return `fetch bizevents${window}
| filter event.type == "gen_ai.evaluation.result"
| filter toString(trace.id) == "${traceIdHex}"
| fields
    name = gen_ai.evaluation.name,
    label = gen_ai.evaluation.score.label,
    score = gen_ai.evaluation.score.value,
    explanation = gen_ai.evaluation.explanation
| limit 200`;
}
