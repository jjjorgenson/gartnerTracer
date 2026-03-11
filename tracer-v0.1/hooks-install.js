/**
 * AutoDocs v0.1 - Hooks install and status (TRD Epic 3).
 * install: write Cursor hooks.json so cursor-hook.js is invoked.
 * status: print whether hook config exists, last span time, spans path.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SPANS_FILE, REJECTED_FILE, TRACER_DIR } = require('./span-writer.js');

const CURSOR_HOME = path.join(os.homedir(), '.cursor');
const CURSOR_HOOKS_JSON = path.join(CURSOR_HOME, 'hooks.json');
const HOOKS_VERSION = 1;

function getCursorHookCommand() {
  const scriptPath = path.join(__dirname, 'cursor-hook.js');
  return `node "${scriptPath}"`;
}

function install() {
  const cmd = getCursorHookCommand();
  const config = {
    version: HOOKS_VERSION,
    hooks: {
      afterAgentResponse: [{ command: cmd }],
      afterAgentThought: [{ command: cmd }],
      beforeSubmitPrompt: [{ command: cmd }],
      afterFileEdit: [{ command: cmd }],
      afterShellExecution: [{ command: cmd }],
      afterMCPExecution: [{ command: cmd }],
      stop: [{ command: cmd }],
      sessionStart: [{ command: cmd }],
      sessionEnd: [{ command: cmd }]
    }
  };
  if (!fs.existsSync(CURSOR_HOME)) {
    fs.mkdirSync(CURSOR_HOME, { recursive: true });
  }
  fs.writeFileSync(CURSOR_HOOKS_JSON, JSON.stringify(config, null, 2), 'utf8');
  console.log('Installed Cursor hooks to', CURSOR_HOOKS_JSON);
  console.log('AutoDocs will log spans to', SPANS_FILE);
}

function status() {
  const hooksExist = fs.existsSync(CURSOR_HOOKS_JSON);
  console.log('Cursor hooks config:', hooksExist ? CURSOR_HOOKS_JSON : '(not found)');
  console.log('Spans file:', SPANS_FILE);
  if (fs.existsSync(SPANS_FILE)) {
    const stat = fs.statSync(SPANS_FILE);
    const lines = fs.readFileSync(SPANS_FILE, 'utf8').trim().split('\n').filter(Boolean);
    console.log('  size:', stat.size, 'bytes, lines:', lines.length);
    if (lines.length > 0) {
      try {
        const last = JSON.parse(lines[lines.length - 1]);
        console.log('  last span:', last.timestamp || '(no timestamp)', last.event || '');
      } catch (_) {
        console.log('  last span: (parse error)');
      }
    }
  } else {
    console.log('  (file does not exist yet)');
  }
  if (fs.existsSync(REJECTED_FILE)) {
    const lines = fs.readFileSync(REJECTED_FILE, 'utf8').trim().split('\n').filter(Boolean);
    console.log('Rejected spans:', REJECTED_FILE, 'lines:', lines.length);
  }
}

module.exports = { install, status };
