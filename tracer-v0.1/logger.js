/**
 * AutoDocs v0.1 - Fail-Open Telemetry Logger
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const TRACER_DIR = path.join(os.homedir(), '.tracer');
const SPANS_FILE = path.join(TRACER_DIR, 'spans.jsonl');

function logSpan(spanData) {
  try {
    // Ensure the ~/.tracer directory exists
    if (!fs.existsSync(TRACER_DIR)) {
      fs.mkdirSync(TRACER_DIR, { recursive: true });
    }

    // STRICT SECURITY RULE: Strip sensitive fields if accidentally included
    delete spanData.promptText;
    delete spanData.codeDiff;
    delete spanData.documentContent;

    // Append as a JSONL string
    const spanLine = JSON.stringify(spanData) + '\n';
    fs.appendFileSync(SPANS_FILE, spanLine, 'utf8');
    
  } catch (err) {
    // FAIL-OPEN: If the disk is full or permissions fail, we swallow the error.
    // We NEVER crash the developer's underlying tool.
  }
}

module.exports = { logSpan };