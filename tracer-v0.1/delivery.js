/**
 * TRACER v0.1 - Delivery Adapter (suggest | pr-comment)
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

async function deliverSuggestion(matchedDocs, aiGeneratedMarkdown, strategy = 'suggest') {
  const suggestionId = `update_${crypto.randomUUID()}`;

  try {
    if (strategy === 'pr-comment' && process.env.GITHUB_TOKEN) {
      const body = `## Tracer: suggested doc update\n\nTargets: ${matchedDocs.join(', ')}\n\n<details>\n<summary>Suggested content</summary>\n\n\`\`\`markdown\n${aiGeneratedMarkdown}\n\`\`\`\n\n</details>`;
      const commentUrl = await postPrComment(body);
      console.log(`✅ [Delivery] PR comment posted: ${commentUrl}`);
      writeSuggestArtifact(matchedDocs, aiGeneratedMarkdown, suggestionId);
      updateDocStatus(matchedDocs, suggestionId);
      return;
    }
  } catch (err) {
    console.warn(`⚠️ [Delivery] pr-comment failed (${err.message}), falling back to suggest`);
  }

  try {
    writeSuggestArtifact(matchedDocs, aiGeneratedMarkdown, suggestionId);
    updateDocStatus(matchedDocs, suggestionId);
  } catch (err) {
    console.error(`💥 Delivery Failure: ${err.message}`);
    throw err;
  }
}

module.exports = { deliverSuggestion, getTracerDir };