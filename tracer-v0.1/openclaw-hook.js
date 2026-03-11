#!/usr/bin/env node

/**
 * TRACER v0.1 - OpenClaw hook script (TRD §3.1, port from instinct8).
 * Receives JSON payload via stdin; maps to Span (tool: openclaw) and writes via span-writer.
 * Adapts OpenClaw/instinct8 event shape to TRD SpanEvent.
 */
const { writeSpan, generateId } = require('./span-writer.js');

const EVENT_MAP = {
  session_start: 'session_start',
  start: 'session_start',
  thinking: 'thinking',
  response: 'response',
  file_edit: 'file_edit',
  shell_exec: 'shell_exec',
  mcp_exec: 'mcp_exec',
  session_end: 'session_end',
  stop: 'session_end',
  end: 'session_end'
};

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });
}

function mapPayloadToSpan(payload, eventName) {
  const trdEvent = EVENT_MAP[eventName] || EVENT_MAP[payload?.event] || 'session_end';
  const sessionId = payload?.session_id ?? payload?.conversation_id ?? payload?.sessionId ?? `openclaw-${Date.now()}`;
  const span = {
    id: generateId(),
    sessionId,
    tool: 'openclaw',
    event: trdEvent,
    timestamp: payload?.timestamp || new Date().toISOString(),
    durationMs: payload?.duration_ms ?? payload?.durationMs ?? payload?.latencyMs,
    model: payload?.model,
    provider: payload?.provider || 'anthropic',
    inputTokens: payload?.input_tokens ?? payload?.inputTokens,
    outputTokens: payload?.output_tokens ?? payload?.outputTokens,
    estimatedCost: payload?.estimated_cost ?? payload?.estimatedCost,
    file: payload?.file ?? payload?.path,
    command: payload?.command,
    mcpTool: payload?.mcp_tool ?? payload?.mcpTool,
    metadata: {}
  };
  if (trdEvent === 'response' && span.inputTokens == null && span.outputTokens == null) {
    span.metadata.warning = 'token_count_unavailable';
  }
  return span;
}

async function main() {
  try {
    const raw = await readStdin();
    const eventName = process.argv[2] || null;
    let payload = {};
    if (raw && raw.trim()) {
      try {
        payload = JSON.parse(raw.trim());
      } catch (_) {}
    }
    const event = payload?.event ?? payload?.hook_event_name ?? eventName ?? 'session_end';
    const span = mapPayloadToSpan(payload, event);
    writeSpan(span);
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
  } catch (_) {
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
  }
  process.exit(0);
}

main();
