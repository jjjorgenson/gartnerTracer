/**
 * TRACER v0.1 - Span JSONL writer with validation (TRD §3.1).
 * Valid spans → ~/.tracer/spans.jsonl; invalid → ~/.tracer/spans-rejected.jsonl with reason.
 * Rotates at 10MB / 5MB.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ulid } = require('ulid');

const TRACER_DIR = path.join(os.homedir(), '.tracer');
const SPANS_FILE = path.join(TRACER_DIR, 'spans.jsonl');
const REJECTED_FILE = path.join(TRACER_DIR, 'spans-rejected.jsonl');
const SPANS_MAX_BYTES = 10 * 1024 * 1024;   // 10MB
const REJECTED_MAX_BYTES = 5 * 1024 * 1024; // 5MB

const TOOLS = new Set(['cursor', 'claude-code', 'openclaw', 'sdk', 'unknown']);
const EVENTS = new Set([
  'session_start', 'thinking', 'response', 'file_edit', 'shell_exec', 'mcp_exec', 'session_end'
]);

// ULID: 26 chars, first 0-7 (timestamp), rest Crockford base32 (case-insensitive)
const ULID_REGEX = /^[0-7][0-9A-HJKMNPQRSTVWXYZa-hjkmnp-tv-z]{25}$/;

const SENSITIVE_KEYS = new Set(['promptText', 'codeDiff', 'documentContent', 'sensitivePrompt', 'prompt']);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function stripSensitive(span) {
  const out = { ...span };
  for (const key of Object.keys(out)) {
    if (SENSITIVE_KEYS.has(key)) delete out[key];
  }
  if (out.metadata && typeof out.metadata === 'object') {
    const m = { ...out.metadata };
    for (const key of Object.keys(m)) {
      if (SENSITIVE_KEYS.has(key)) delete m[key];
    }
    out.metadata = m;
  }
  return out;
}

/**
 * Validate span against TRD §3.1. Returns { valid: true } or { valid: false, reason: string }.
 */
function validate(span) {
  if (!span || typeof span !== 'object') {
    return { valid: false, reason: 'span must be an object' };
  }
  if (typeof span.id !== 'string' || !ULID_REGEX.test(span.id)) {
    return { valid: false, reason: 'id must be a valid ULID (26 chars, Crockford base32)' };
  }
  if (typeof span.sessionId !== 'string' || span.sessionId.length === 0) {
    return { valid: false, reason: 'sessionId is required and non-empty' };
  }
  if (!TOOLS.has(span.tool)) {
    return { valid: false, reason: `tool must be one of: ${[...TOOLS].join(', ')}` };
  }
  if (!EVENTS.has(span.event)) {
    return { valid: false, reason: `event must be one of: ${[...EVENTS].join(', ')}` };
  }
  if (typeof span.timestamp !== 'string' || span.timestamp.length === 0) {
    return { valid: false, reason: 'timestamp is required (ISO 8601 UTC)' };
  }
  const ts = Date.parse(span.timestamp);
  if (Number.isNaN(ts)) {
    return { valid: false, reason: 'timestamp must be valid ISO 8601' };
  }
  if (span.event === 'response') {
    if (!span.model || typeof span.model !== 'string') {
      return { valid: false, reason: 'event=response requires model' };
    }
    const hasTokens = (typeof span.inputTokens === 'number' && span.inputTokens >= 0) ||
      (typeof span.outputTokens === 'number' && span.outputTokens >= 0);
    if (!hasTokens) {
      // TRD: log warning in metadata; we still accept but could set metadata.warning
      // Validation passes; caller can add metadata.warning if desired
    }
  }
  return { valid: true };
}

function rotateIfNeeded(filePath, maxBytes) {
  try {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (stat.size < maxBytes) return;
    const backup = filePath + '.1';
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    fs.renameSync(filePath, backup);
  } catch (_) {
    // Fail-open: ignore rotation errors
  }
}

/**
 * Append one line to file; rotate if over maxBytes.
 */
function appendLine(filePath, line, maxBytes) {
  ensureDir(TRACER_DIR);
  rotateIfNeeded(filePath, maxBytes);
  fs.appendFileSync(filePath, line + '\n', 'utf8');
}

/**
 * Write a span. If valid, appends to spans.jsonl; otherwise appends to spans-rejected.jsonl with reason.
 * Strips sensitive fields before writing. Fail-open: never throws.
 */
function writeSpan(span) {
  const stripped = stripSensitive(span);
  const result = validate(stripped);
  try {
    if (result.valid) {
      appendLine(SPANS_FILE, JSON.stringify(stripped), SPANS_MAX_BYTES);
    } else {
      const rejectedLine = JSON.stringify({
        ...stripped,
        _rejectedReason: result.reason,
        _rejectedAt: new Date().toISOString()
      });
      appendLine(REJECTED_FILE, rejectedLine, REJECTED_MAX_BYTES);
    }
  } catch (_) {
    // FAIL-OPEN: never crash the host tool
  }
}

/**
 * Generate a new ULID for span id.
 */
function generateId() {
  return ulid();
}

module.exports = {
  SPANS_FILE,
  REJECTED_FILE,
  TRACER_DIR,
  TOOLS,
  EVENTS,
  validate,
  writeSpan,
  generateId,
  stripSensitive
};
