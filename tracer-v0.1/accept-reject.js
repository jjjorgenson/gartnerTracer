/**
 * TRACER v0.1 - accept / reject suggestion (trd3gpt §13)
 * tracer accept <artifact> → mark accepted, update doc-status to CURRENT, apply content to doc files
 * tracer reject <artifact> → mark rejected, doc-status stays PENDING
 */

const fs = require('node:fs');
const path = require('node:path');
const { getTracerDir } = require('./delivery');

function resolveArtifactPath(artifact) {
  if (!artifact || typeof artifact !== 'string') return null;
  const trimmed = artifact.trim();
  if (fs.existsSync(trimmed)) return trimmed;
  const name = trimmed.endsWith('.json') ? trimmed : `${trimmed}.json`;
  for (const base of [getTracerDir(), path.join(process.cwd(), '.tracer')]) {
    const candidate = path.join(base, 'suggestions', name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function getTracerDirFromArtifact(artifactPath) {
  const dir = path.dirname(artifactPath);
  if (path.basename(dir) === 'suggestions') {
    return path.dirname(dir);
  }
  return getTracerDir();
}

function loadSuggestion(artifactPath) {
  const raw = fs.readFileSync(artifactPath, 'utf8');
  const data = JSON.parse(raw);
  const targets = data.targets || [];
  const content = data.content;
  const id = data.id;
  if (!targets.length || content == null) {
    throw new Error('Invalid suggestion artifact: missing targets or content');
  }
  return { id, targets, content };
}

function acceptSuggestion(artifactPath) {
  const tracerDir = getTracerDirFromArtifact(artifactPath);
  const statusFile = path.join(tracerDir, 'doc-status.json');
  const { id, targets, content } = loadSuggestion(artifactPath);

  for (const docPath of targets) {
    const fullPath = path.isAbsolute(docPath) ? docPath : path.join(process.cwd(), docPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`✅ Applied to ${docPath}`);
  }

  let statusData = { docs: {} };
  if (fs.existsSync(statusFile)) {
    statusData = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  }
  const now = new Date().toISOString();
  for (const doc of targets) {
    statusData.docs[doc] = {
      status: 'CURRENT',
      lastSuggestionId: id,
      lastAcceptedAt: now,
      lastUpdated: now
    };
  }
  fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf8');
  console.log(`📝 doc-status.json updated: ${targets.length} doc(s) marked CURRENT`);
}

function rejectSuggestion(artifactPath) {
  const tracerDir = getTracerDirFromArtifact(artifactPath);
  const statusFile = path.join(tracerDir, 'doc-status.json');
  const { id, targets } = loadSuggestion(artifactPath);

  let statusData = { docs: {} };
  if (fs.existsSync(statusFile)) {
    statusData = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  }
  const now = new Date().toISOString();
  for (const doc of targets) {
    const existing = statusData.docs[doc] || {};
    statusData.docs[doc] = {
      ...existing,
      status: 'PENDING',
      lastRejectedSuggestionId: id,
      lastRejectedAt: now,
      lastUpdated: now
    };
  }
  fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf8');
  console.log(`📝 doc-status.json updated: suggestion ${id} rejected for ${targets.length} doc(s)`);
}

module.exports = { resolveArtifactPath, acceptSuggestion, rejectSuggestion };
