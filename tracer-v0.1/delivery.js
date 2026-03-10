/**
 * TRACER v0.1 - Delivery Adapter (suggest | pr-comment | commit)
 * The commit strategy routes github-wiki docs through the WikiAdapter.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { postPrComment } = require('./github');

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

function updateDocStatus(matchedDocs, suggestionId) {
  let statusData = { docs: {} };
  if (fs.existsSync(STATUS_FILE)) {
    statusData = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
  }
  matchedDocs.forEach(doc => {
    statusData.docs[doc] = {
      status: 'PENDING',
      lastUpdated: new Date().toISOString(),
      lastSuggestionId: suggestionId
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

  const parts = [`Tracer: updated ${pageSlug}`];
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
 * @param {string[]} matchedDocs
 * @param {string} aiGeneratedMarkdown
 * @param {string} [strategy='suggest']
 * @param {object} [opts] - { docTypeByDoc: Map, commitContext: { commitHash, prNumber, repo } }
 */
async function deliverSuggestion(matchedDocs, aiGeneratedMarkdown, strategy = 'suggest', opts = {}) {
  const suggestionId = `update_${crypto.randomUUID()}`;
  const { docTypeByDoc, commitContext } = opts;

  // Commit strategy for github-wiki docs: push directly to wiki repo
  if (strategy === 'commit' && docTypeByDoc) {
    const wikiDocs = matchedDocs.filter(d => docTypeByDoc.get(d) === 'github-wiki');
    const repoDocs = matchedDocs.filter(d => docTypeByDoc.get(d) !== 'github-wiki');

    for (const pageSlug of wikiDocs) {
      try {
        await deliverToWiki(pageSlug, aiGeneratedMarkdown, commitContext || {});
        updateDocStatus([`wiki:${pageSlug}`], suggestionId);
      } catch {
        writeSuggestArtifact([pageSlug], aiGeneratedMarkdown, suggestionId);
        updateDocStatus([pageSlug], suggestionId);
      }
    }

    if (repoDocs.length > 0) {
      writeSuggestArtifact(repoDocs, aiGeneratedMarkdown, suggestionId);
      updateDocStatus(repoDocs, suggestionId);
    }
    return;
  }

  try {
    if (strategy === 'pr-comment' && process.env.GITHUB_TOKEN) {
      const body = `## Tracer: suggested doc update\n\nTargets: ${matchedDocs.join(', ')}\n\n<details>\n<summary>Suggested content</summary>\n\n\`\`\`markdown\n${aiGeneratedMarkdown}\n\`\`\`\n\n</details>`;
      const commentUrl = await postPrComment(body);
      console.log(`\u2705 [Delivery] PR comment posted: ${commentUrl}`);
      writeSuggestArtifact(matchedDocs, aiGeneratedMarkdown, suggestionId);
      updateDocStatus(matchedDocs, suggestionId);
      return;
    }
  } catch (err) {
    console.warn(`\u26a0\ufe0f [Delivery] pr-comment failed (${err.message}), falling back to suggest`);
  }

  try {
    writeSuggestArtifact(matchedDocs, aiGeneratedMarkdown, suggestionId);
    updateDocStatus(matchedDocs, suggestionId);
  } catch (err) {
    console.error(`\ud83d\udca5 Delivery Failure: ${err.message}`);
    throw err;
  }
}

module.exports = { deliverSuggestion, deliverToWiki, getTracerDir };