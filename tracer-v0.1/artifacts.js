/**
 * TRACER v0.1 - ChangeSummary and DocUpdate artifact emission (TRD §3.2, §3.3)
 * Writes to .tracer/change-summaries/ and .tracer/doc-updates/ for dashboard consumption.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createPatch } = require('diff');
const { getTracerDir } = require('./delivery');

function generateId(prefix) {
  const t = Date.now().toString(36);
  const r = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${t}_${r}`;
}

function ensureArtifactDirs() {
  const base = getTracerDir();
  const csDir = path.join(base, 'change-summaries');
  const duDir = path.join(base, 'doc-updates');
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  if (!fs.existsSync(csDir)) fs.mkdirSync(csDir, { recursive: true });
  if (!fs.existsSync(duDir)) fs.mkdirSync(duDir, { recursive: true });
  return { base, changeSummariesDir: csDir, docUpdatesDir: duDir };
}

/**
 * Compute SHA-256 hash of content, TRD format: "sha256:hex"
 */
function contentHash(content) {
  const hex = crypto.createHash('sha256').update(content || '', 'utf8').digest('hex');
  return `sha256:${hex}`;
}

/**
 * Produce unified diff (current -> suggested). Uses diff.createPatch.
 * @param {string} filePath - logical path for the file (e.g. doc path or "Page-Name.md")
 * @param {string} oldStr - current content
 * @param {string} newStr - suggested content
 * @returns {string}
 */
function createUnifiedDiff(filePath, oldStr, newStr) {
  return createPatch(filePath, oldStr || '', newStr || '', 'current', 'suggested');
}

/**
 * Write a ChangeSummary to .tracer/change-summaries/{id}.json
 * @param {object} summary - full ChangeSummary object (TRD §3.3 + schemaVersion, prNumber?, branch?, repo?)
 * @returns {string} id
 */
function writeChangeSummary(summary) {
  const { changeSummariesDir } = ensureArtifactDirs();
  const id = summary.id || generateId('cs');
  const obj = { ...summary, id };
  const filePath = path.join(changeSummariesDir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  return id;
}

/**
 * Write a DocUpdate to .tracer/doc-updates/{id}.json
 * @param {object} docUpdate - full DocUpdate object (TRD §3.2)
 * @returns {string} id
 */
function writeDocUpdate(docUpdate) {
  const { docUpdatesDir } = ensureArtifactDirs();
  const id = docUpdate.id || generateId('du');
  const obj = { ...docUpdate, id };
  const filePath = path.join(docUpdatesDir, `${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  return id;
}

/**
 * Build a ChangeSummary object from agent run context. Caller fills in docsAffected, docsUpdated, etc.
 * @param {object} opts - commitHash, commitMessage, author, timestamp, changedFiles, repo?, prNumber?, branch?
 * @param {object} opts.provenance - model, provider, inputTokens, outputTokens, timestamp
 * @param {string} opts.markdownBody
 * @param {Array} opts.docsAffected - DocImpact[]
 * @param {number} opts.docsUpdated
 * @param {number} opts.docsSkipped
 */
function buildChangeSummary(opts) {
  const n = opts.changedFiles?.length ?? 0;
  return {
    id: generateId('cs'),
    commitHash: opts.commitHash || '',
    commitMessage: opts.commitMessage || '',
    author: opts.author || '',
    timestamp: opts.timestamp || new Date().toISOString(),
    filesChanged: n,
    filesAdded: opts.filesAdded ?? 0,
    filesModified: opts.filesModified ?? n,
    filesDeleted: opts.filesDeleted ?? 0,
    docsAffected: opts.docsAffected || [],
    docsUpdated: opts.docsUpdated ?? 0,
    docsSkipped: opts.docsSkipped ?? 0,
    provenance: opts.provenance || { model: '', provider: '', timestamp: '', inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
    markdownBody: opts.markdownBody || '',
    schemaVersion: 1,
    prNumber: opts.prNumber ?? null,
    branch: opts.branch ?? null,
    repo: opts.repo ?? null,
  };
}

/**
 * Build a DocUpdate object. Caller provides content, hashes, delivery result.
 * @param {object} opts - docRef, strategy, currentHash, suggestedContent, suggestedHash, diffFromCurrent, provenance, deliveryStatus, deliveryRef?, deliveredAt?
 */
function buildDocUpdate(opts) {
  const now = opts.timestamp || new Date().toISOString();
  return {
    id: generateId('du'),
    commitHash: opts.commitHash || '',
    triggeredBy: process.env.GITHUB_ACTIONS ? 'ci' : 'manual',
    docRef: opts.docRef || { type: 'repo', path: '' },
    strategy: opts.strategy || 'suggest',
    currentHash: opts.currentHash || '',
    suggestedContent: opts.suggestedContent ?? '',
    suggestedHash: opts.suggestedHash || '',
    diffFromCurrent: opts.diffFromCurrent || '',
    sectionsModified: opts.sectionsModified || [],
    provenance: opts.provenance || { model: '', provider: '', timestamp: now, inputTokens: 0, outputTokens: 0, estimatedCost: 0 },
    deliveryStatus: opts.deliveryStatus || 'pending',
    deliveryRef: opts.deliveryRef,
    deliveredAt: opts.deliveredAt,
    timestamp: now,
  };
}

module.exports = {
  generateId,
  ensureArtifactDirs,
  contentHash,
  createUnifiedDiff,
  writeChangeSummary,
  writeDocUpdate,
  buildChangeSummary,
  buildDocUpdate,
};
