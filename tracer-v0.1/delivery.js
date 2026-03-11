/**
 * AutoDocs v0.1 - Delivery Adapter (suggest | pr-comment | commit)
 * The commit strategy routes github-wiki docs through the WikiAdapter.
 * Writes DocUpdate artifacts (TRD §3.2) and updates doc-status (TRD §6).
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { postPrComment } = require('./github');
const artifacts = require('./artifacts');

function getTracerDir() {
  if (process.env.TRACER_OUTPUT_DIR) {
    return path.resolve(process.cwd(), process.env.TRACER_OUTPUT_DIR);
  }
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    return path.join(process.cwd(), '.tracer');
  }
  return path.join(os.homedir(), '.tracer');
}

const TRACER_DIR = getTracerDir();
const SUGGESTIONS_DIR = path.join(TRACER_DIR, 'suggestions');
const STATUS_FILE = path.join(TRACER_DIR, 'doc-status.json');

function writeSuggestArtifact(matchedDocs, aiGeneratedMarkdown, suggestionId) {
  if (!fs.existsSync(SUGGESTIONS_DIR)) {
    fs.mkdirSync(SUGGESTIONS_DIR, { recursive: true });
  }
  const payload = {
    id: suggestionId,
    timestamp: new Date().toISOString(),
    trigger: process.env.GITHUB_ACTIONS ? 'ci' : 'manual',
    targets: matchedDocs,
    content: aiGeneratedMarkdown
  };
  const filePath = path.join(SUGGESTIONS_DIR, `${suggestionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ [Delivery] Suggestion artifact written to: ${filePath}`);
}

/**
 * Update doc-status.json (TRD §6): state, lastVerifiedCommit, contentHash, lastUpdated; top-level repo.
 * @param {string[]} matchedDocs - doc keys (path or wiki:Page-Slug)
 * @param {object} opts - { commitHash, contentHash (current doc hash), repo }
 */
function updateDocStatus(matchedDocs, opts = {}) {
  let statusData = {};
  if (fs.existsSync(STATUS_FILE)) {
    const raw = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    // Support legacy { docs: { path: {...} } } and TRD top-level path keys
    if (raw.repo !== undefined) statusData.repo = raw.repo;
    const docEntries = raw.docs ? Object.entries(raw.docs) : Object.entries(raw).filter(([k]) => k !== 'repo');
    docEntries.forEach(([k, v]) => { statusData[k] = v; });
  }
  if (opts.repo !== undefined) statusData.repo = opts.repo;
  const now = new Date().toISOString();
  matchedDocs.forEach(doc => {
    statusData[doc] = {
      state: 'pending',
      lastVerifiedCommit: opts.commitHash || '',
      contentHash: opts.contentHash || '',
      lastUpdated: now,
      ...(opts.staleReason && { staleReason: opts.staleReason }),
    };
  });
  fs.writeFileSync(STATUS_FILE, JSON.stringify(statusData, null, 2), 'utf8');
  console.log(`📝 [State] Updated doc-status.json (Marked ${matchedDocs.length} docs as PENDING)`);
}

/**
 * Deliver wiki page update via the GitHubWikiAdapter (commit strategy).
 * @param {string} pageSlug - wiki page slug (e.g. "API-Reference")
 * @param {string} content  - markdown content
 * @param {object} [context] - { commitHash, prNumber, repo }
 * @returns {{ committed: boolean, pushed: boolean }}
 */
async function deliverToWiki(pageSlug, content, context = {}) {
  const { GitHubWikiAdapter } = require('./adapters/github-wiki');
  const adapter = new GitHubWikiAdapter({ repo: context.repo });

  const parts = [`AutoDocs: updated ${pageSlug}`];
  if (context.prNumber) parts.push(`PR #${context.prNumber}`);
  if (context.commitHash) parts.push(`commit ${context.commitHash.slice(0, 7)}`);
  const message = parts.length > 1
    ? `${parts[0]} (${parts.slice(1).join(', ')})`
    : parts[0];

  try {
    const result = adapter.write(pageSlug, content, message);
    if (result.committed) {
      console.log(`\u2705 [Delivery] Wiki page "${pageSlug}" committed${result.pushed ? ' and pushed' : ''}`);
    } else {
      console.log(`\u2139\ufe0f [Delivery] Wiki page "${pageSlug}" unchanged`);
    }
    return result;
  } catch (err) {
    console.warn(`\u26a0\ufe0f [Delivery] Wiki commit failed (${err.message}), falling back to suggest`);
    throw err;
  }
}

/**
 * Build and write one DocUpdate; update doc-status (TRD §6). Returns docUpdateId and delivery outcome.
 * @param {string[]} matchedDocs
 * @param {string} aiGeneratedMarkdown
 * @param {string} docPath - primary doc path for this update
 * @param {string} docContent - current doc content (for currentHash and diff)
 * @param {string} [strategy='suggest']
 * @param {object} [opts] - { docTypeByDoc: Map, commitContext: { commitHash, prNumber, repo }, provenance: { model, provider, inputTokens, outputTokens } }
 * @returns {Promise<{ docUpdateId: string, deliveryFailed: boolean, deliveryRef?: string }>}
 */
async function deliverSuggestion(matchedDocs, aiGeneratedMarkdown, docPath, docContent, strategy = 'suggest', opts = {}) {
  const suggestionId = `update_${crypto.randomUUID()}`;
  const { docTypeByDoc, commitContext, provenance: prov } = opts;
  const ctx = commitContext || {};
  const currentHash = artifacts.contentHash(docContent);
  const suggestedHash = artifacts.contentHash(aiGeneratedMarkdown);
  const diffFromCurrent = artifacts.createUnifiedDiff(docPath, docContent, aiGeneratedMarkdown);
  const docRef = { type: docTypeByDoc?.get(docPath) === 'github-wiki' ? 'repo' : 'repo', path: docPath };
  const now = new Date().toISOString();
  const provenance = {
    model: prov?.model || 'claude-sonnet-4-6',
    provider: prov?.provider || 'anthropic',
    timestamp: now,
    inputTokens: prov?.inputTokens ?? 0,
    outputTokens: prov?.outputTokens ?? 0,
    estimatedCost: 0,
    promptHash: prov?.promptHash || '',
  };
  const statusOpts = { commitHash: ctx.commitHash || '', contentHash: currentHash, repo: ctx.repo };

  /** Status keys for doc-status.json: repo path or wiki:Page-Slug */
  const statusKeysFor = (docs) => (docTypeByDoc ? docs.map(d => docTypeByDoc.get(d) === 'github-wiki' ? `wiki:${d}` : d) : docs);

  const writeDocUpdateAndStatus = (deliveryStatus, deliveryRef, deliveredAt, statusKeys) => {
    const keys = statusKeys || matchedDocs;
    const docUpdate = artifacts.buildDocUpdate({
      commitHash: ctx.commitHash,
      docRef,
      strategy,
      currentHash,
      suggestedContent: aiGeneratedMarkdown,
      suggestedHash,
      diffFromCurrent,
      provenance,
      deliveryStatus,
      deliveryRef,
      deliveredAt,
      timestamp: now,
    });
    const docUpdateId = artifacts.writeDocUpdate(docUpdate);
    updateDocStatus(statusKeysFor(Array.isArray(keys) ? keys : [keys]), statusOpts);
    return docUpdateId;
  };

  // Commit strategy for github-wiki docs: push directly to wiki repo
  if (strategy === 'commit' && docTypeByDoc) {
    const wikiDocs = matchedDocs.filter(d => docTypeByDoc.get(d) === 'github-wiki');
    const repoDocs = matchedDocs.filter(d => docTypeByDoc.get(d) !== 'github-wiki');

    for (const pageSlug of wikiDocs) {
      try {
        await deliverToWiki(pageSlug, aiGeneratedMarkdown, ctx);
        writeSuggestArtifact([pageSlug], aiGeneratedMarkdown, suggestionId);
        const docUpdateId = writeDocUpdateAndStatus('delivered', undefined, now, [pageSlug]);
        if (repoDocs.length === 0) return { docUpdateId, deliveryFailed: false };
      } catch (_) {
        writeSuggestArtifact([pageSlug], aiGeneratedMarkdown, suggestionId);
        const docUpdateId = writeDocUpdateAndStatus('failed', undefined, undefined, [pageSlug]);
        return { docUpdateId, deliveryFailed: true };
      }
    }

    if (repoDocs.length > 0) {
      writeSuggestArtifact(repoDocs, aiGeneratedMarkdown, suggestionId);
      const docUpdateId = writeDocUpdateAndStatus('pending', undefined, undefined, repoDocs);
      return { docUpdateId, deliveryFailed: false };
    }
    const docUpdateId = writeDocUpdateAndStatus('pending', undefined, undefined, matchedDocs);
    return { docUpdateId, deliveryFailed: false };
  }

  try {
    if (strategy === 'pr-comment' && process.env.GITHUB_TOKEN) {
      const body = `## AutoDocs: suggested doc update\n\nTargets: ${matchedDocs.join(', ')}\n\n<details>\n<summary>Suggested content</summary>\n\n\`\`\`markdown\n${aiGeneratedMarkdown}\n\`\`\`\n\n</details>`;
      const commentUrl = await postPrComment(body);
      console.log(`\u2705 [Delivery] PR comment posted: ${commentUrl}`);
      writeSuggestArtifact(matchedDocs, aiGeneratedMarkdown, suggestionId);
      const docUpdateId = writeDocUpdateAndStatus('delivered', commentUrl, now);
      return { docUpdateId, deliveryFailed: false, deliveryRef: commentUrl };
    }
  } catch (err) {
    console.warn(`\u26a0\ufe0f [Delivery] pr-comment failed (${err.message}), falling back to suggest`);
  }

  try {
    writeSuggestArtifact(matchedDocs, aiGeneratedMarkdown, suggestionId);
    const docUpdateId = writeDocUpdateAndStatus('pending', undefined, undefined);
    return { docUpdateId, deliveryFailed: false };
  } catch (err) {
    console.error(`\ud83d\udca5 Delivery Failure: ${err.message}`);
    throw err;
  }
}

module.exports = { deliverSuggestion, deliverToWiki, getTracerDir, updateDocStatus };