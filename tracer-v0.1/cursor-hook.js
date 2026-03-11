#!/usr/bin/env node

/**
 * TRACER v0.1 - Cursor hook script (TRD §3.1).
 * Receives JSON payload from Cursor via stdin; maps to Span and writes via span-writer.
 * Cursor events: beforeSubmitPrompt, afterAgentThought, afterAgentResponse, afterFileEdit,
 * afterShellExecution, afterMCPExecution, stop, sessionStart, sessionEnd, etc.
 */
const { writeSpan, generateId } = require('./span-writer.js');

const CURSOR_TO_TRD_EVENT = {
  beforeSubmitPrompt: 'session_start',
  sessionStart: 'session_start',
  afterAgentThought: 'thinking',
  afterAgentResponse: 'response',
  afterFileEdit: 'file_edit',
  afterShellExecution: 'shell_exec',
  afterMCPExecution: 'mcp_exec',
  stop: 'session_end',
  sessionEnd: 'session_end'
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

function mapCursorPayloadToSpan(payload, eventName) {
  const trdEvent = CURSOR_TO_TRD_EVENT[eventName] || 'session_end';
  const sessionId = payload.conversation_id || payload.session_id || `cursor-${Date.now()}`;
  const span = {
    id: generateId(),
    sessionId,
    traceId: payload.trace_id,
    tool: 'cursor',
    event: trdEvent,
    timestamp: payload.timestamp || new Date().toISOString(),
    durationMs: payload.duration_ms ?? payload.durationMs,
    model: payload.model,
    provider: payload.provider || 'anthropic',
    inputTokens: payload.input_tokens ?? payload.inputTokens ?? payload.usage?.prompt_tokens ?? payload.usage?.input_tokens,
    outputTokens: payload.output_tokens ?? payload.outputTokens ?? payload.usage?.completion_tokens ?? payload.usage?.output_tokens,
    estimatedCost: payload.estimated_cost ?? payload.estimatedCost,
    file: payload.file ?? payload.path,
    command: payload.command,
    mcpTool: payload.mcp_tool ?? payload.mcpTool,
    promptHash: payload.prompt_hash ?? payload.promptHash,
    metadata: {}
  };
  if ((trdEvent === 'response') && (span.inputTokens == null && span.outputTokens == null)) {
    span.metadata.warning = 'token_count_unavailable';
  }
  if (payload.workspace_roots) span.metadata.workspace_roots = payload.workspace_roots;
  if (payload.generation_id) span.metadata.generation_id = payload.generation_id;
  return span;
}

async function main() {
  try {
    const raw = await readStdin();
    const eventName = process.argv[2] || null;
    let payload;
    try {
      payload = raw ? JSON.parse(raw.trim()) : {};
    } catch (_) {
      payload = {};
    }
    const hookEvent = payload.hook_event_name || eventName || 'stop';
    const span = mapCursorPayloadToSpan(payload, hookEvent);
    writeSpan(span);
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
  } catch (_) {
    process.stdout.write(JSON.stringify({ continue: true }) + '\n');
  }
  process.exit(0);
}

main();
