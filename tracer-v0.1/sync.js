/**
 * TRACER v0.1 - tracer sync (TRD Epic 4.4).
 * POST spans.jsonl (or recent lines) to dashboard ingest endpoint.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const http = require('node:http');
const { SPANS_FILE } = require('./span-writer.js');

const DEFAULT_SPANS_PATH = path.join(os.homedir(), '.tracer', 'spans.jsonl');

function readSpansFile(spansPath, maxLines) {
  const p = spansPath || process.env.TRACER_SPANS_PATH || DEFAULT_SPANS_PATH;
  if (!fs.existsSync(p)) return { path: p, lines: [], raw: '' };
  const raw = fs.readFileSync(p, 'utf8');
  const lines = raw.trim().split('\n').filter(Boolean);
  const toSend = maxLines ? lines.slice(-maxLines) : lines;
  return { path: p, lines: toSend, raw: toSend.join('\n') };
}

function post(urlStr, body, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === 'https:';
    const mod = isHttps ? https : http;
    const req = mod.request({
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...opts.headers }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) resolve({ statusCode: res.statusCode, body });
        else reject(new Error(`HTTP ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runSync(opts = {}) {
  const url = opts.url || process.env.TRACER_SYNC_URL;
  if (!url) {
    console.error('Set TRACER_SYNC_URL or pass --url <endpoint>');
    process.exit(2);
  }
  const { path: spansPath, lines, raw } = readSpansFile(opts.spansPath, opts.maxLines);
  if (lines.length === 0) {
    console.log('No spans to sync (file empty or not found):', spansPath);
    process.exit(0);
  }
  const payload = JSON.stringify({ spans: raw, count: lines.length });
  try {
    await post(url, payload);
    console.log(`Synced ${lines.length} span(s) to ${url}`);
  } catch (err) {
    console.error('Sync failed:', err.message);
    process.exit(1);
  }
}

module.exports = { runSync, readSpansFile, post };
