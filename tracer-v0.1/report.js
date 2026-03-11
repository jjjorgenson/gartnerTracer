/**
 * AutoDocs v0.1 - report command (TRD Epic 4.1, 4.2).
 * Reads spans.jsonl, aggregates by model/tool/time, outputs table or JSON.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { SPANS_FILE } = require('./span-writer.js');

const TRACER_DIR = path.join(os.homedir(), '.tracer');
const DEFAULT_SPANS_PATH = path.join(TRACER_DIR, 'spans.jsonl');
const PRICING_PATH = path.join(__dirname, 'pricing.json');

function loadPricing() {
  try {
    return JSON.parse(fs.readFileSync(PRICING_PATH, 'utf8'));
  } catch (_) {
    return { provider: { anthropic: { default: { inputPer1k: 0.003, outputPer1k: 0.015 } } } };
  }
}

function estimateCost(span, pricing) {
  if (typeof span.estimatedCost === 'number' && span.estimatedCost >= 0) return span.estimatedCost;
  const provider = (span.provider || 'anthropic').toLowerCase();
  const model = span.model || 'default';
  const prov = pricing.provider?.[provider] || pricing.provider?.anthropic;
  const rates = prov?.[model] || prov?.default || { inputPer1k: 0.003, outputPer1k: 0.015 };
  const inTok = span.inputTokens || 0;
  const outTok = span.outputTokens || 0;
  return (inTok / 1000) * (rates.inputPer1k || 0) + (outTok / 1000) * (rates.outputPer1k || 0);
}

function parseSince(sinceStr) {
  if (!sinceStr) return 0;
  const m = sinceStr.match(/^(\d+)(h|d|m)$/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const now = Date.now();
  if (unit === 'h') return now - n * 60 * 60 * 1000;
  if (unit === 'd') return now - n * 24 * 60 * 60 * 1000;
  if (unit === 'm') return now - n * 60 * 1000;
  return 0;
}

function readSpans(spansPath, sinceTs) {
  const pathToRead = spansPath || process.env.TRACER_SPANS_PATH || DEFAULT_SPANS_PATH;
  if (!fs.existsSync(pathToRead)) return [];
  const lines = fs.readFileSync(pathToRead, 'utf8').trim().split('\n').filter(Boolean);
  const spans = [];
  for (const line of lines) {
    try {
      const s = JSON.parse(line);
      if (sinceTs && new Date(s.timestamp).getTime() < sinceTs) continue;
      spans.push(s);
    } catch (_) {}
  }
  return spans;
}

function aggregate(spans, pricing) {
  const byModel = {};
  const byTool = {};
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let count = 0;
  for (const s of spans) {
    const cost = estimateCost(s, pricing);
    totalCost += cost;
    totalInput += s.inputTokens || 0;
    totalOutput += s.outputTokens || 0;
    count++;
    const model = s.model || 'unknown';
    if (!byModel[model]) byModel[model] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    byModel[model].calls++;
    byModel[model].inputTokens += s.inputTokens || 0;
    byModel[model].outputTokens += s.outputTokens || 0;
    byModel[model].cost += cost;
    const tool = s.tool || 'unknown';
    if (!byTool[tool]) byTool[tool] = { calls: 0, inputTokens: 0, outputTokens: 0, cost: 0 };
    byTool[tool].calls++;
    byTool[tool].inputTokens += s.inputTokens || 0;
    byTool[tool].outputTokens += s.outputTokens || 0;
    byTool[tool].cost += cost;
  }
  return { byModel, byTool, totalCost, totalInput, totalOutput, count };
}

function formatTable(agg) {
  const lines = [];
  lines.push('--- AutoDocs report ---');
  lines.push(`Total spans: ${agg.count}  Input tokens: ${agg.totalInput}  Output tokens: ${agg.totalOutput}  Est. cost: $${agg.totalCost.toFixed(4)}`);
  lines.push('');
  lines.push('By model:');
  for (const [model, v] of Object.entries(agg.byModel)) {
    lines.push(`  ${model}: calls=${v.calls} in=${v.inputTokens} out=${v.outputTokens} cost=$${v.cost.toFixed(4)}`);
  }
  lines.push('');
  lines.push('By tool:');
  for (const [tool, v] of Object.entries(agg.byTool)) {
    lines.push(`  ${tool}: calls=${v.calls} in=${v.inputTokens} out=${v.outputTokens} cost=$${v.cost.toFixed(4)}`);
  }
  return lines.join('\n');
}

function runReport(opts = {}) {
  const sinceTs = parseSince(opts.since);
  const spansPath = opts.spansPath || null;
  const spans = readSpans(spansPath, sinceTs);
  const pricing = loadPricing();
  const agg = aggregate(spans, pricing);
  if (opts.format === 'json') {
    return JSON.stringify({ count: agg.count, totalCost: agg.totalCost, totalInput: agg.totalInput, totalOutput: agg.totalOutput, byModel: agg.byModel, byTool: agg.byTool }, null, 2);
  }
  return formatTable(agg);
}

module.exports = { runReport, loadPricing, readSpans, aggregate, parseSince };
