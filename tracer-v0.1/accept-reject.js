/**
 * TRACER v0.1 - accept / reject suggestion (TRD §6 acceptance evidence)
 * tracer accept <artifact> → mark accepted, update doc-status to CURRENT, apply content to doc files
 * tracer reject <artifact> → mark rejected, doc-status stays PENDING
 */

const fs = require('node:fs');
const path = require('node:path');
const { getTracerDir } = require('./delivery');
const artifacts = require('./artifacts');

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
    if (isWikiTarget(docPath)) {
      const pageSlug = docPath.startsWith('wiki:') ? docPath.slice(5) : docPath;
      const { GitHubWikiAdapter } = require('./adapters/github-wiki');
      const adapter = new GitHubWikiAdapter();
      const result = adapter.write(pageSlug, content, `AutoDocs: accepted suggestion ${id}`);
      console.log(`\u2705 Wiki page "${pageSlug}" ${result.pushed ? 'pushed' : 'committed locally'}`);
    } else {
      const fullPath = path.isAbsolute(docPath) ? docPath : path.join(process.cwd(), docPath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`\u2705 Applied to ${docPath}`);
    }
  }

  // TRD §6: state, lastVerifiedCommit, contentHash, lastUpdated (top-level doc keys, optional repo)
  let statusData = {};
  if (fs.existsSync(statusFile)) {
    const raw = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    if (raw.repo !== undefined) statusData.repo = raw.repo;
    const docEntries = raw.docs ? Object.entries(raw.docs) : Object.entries(raw).filter(([k]) => k !== 'repo');
    docEntries.forEach(([k, v]) => { statusData[k] = v; });
  }
  const now = new Date().toISOString();
  const contentHash = artifacts.contentHash(content);
  for (const doc of targets) {
    const statusKey = isWikiTarget(doc) ? (doc.startsWith('wiki:') ? doc : `wiki:${doc}`) : doc;
    statusData[statusKey] = {
      state: 'current',
      lastVerifiedCommit: '', // accept is manual; CI may set this on merge
      contentHash,
      lastUpdated: now,
    };
  }
  fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf8');
  console.log(`\ud83d\udcdd doc-status.json updated: ${targets.length} doc(s) marked CURRENT`);
}

function isWikiTarget(docPath) {
  return docPath.startsWith('wiki:') || docPath.match(/^[A-Z][\w-]+$/);
}

function rejectSuggestion(artifactPath) {
  const tracerDir = getTracerDirFromArtifact(artifactPath);
  const statusFile = path.join(tracerDir, 'doc-status.json');
  const { id, targets } = loadSuggestion(artifactPath);

  // TRD §6: keep existing keys, set state to pending on reject
  let statusData = {};
  if (fs.existsSync(statusFile)) {
    const raw = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    if (raw.repo !== undefined) statusData.repo = raw.repo;
    const docEntries = raw.docs ? Object.entries(raw.docs) : Object.entries(raw).filter(([k]) => k !== 'repo');
    docEntries.forEach(([k, v]) => { statusData[k] = v; });
  }
  const now = new Date().toISOString();
  for (const doc of targets) {
    const statusKey = isWikiTarget(doc) ? (doc.startsWith('wiki:') ? doc : `wiki:${doc}`) : doc;
    const existing = statusData[statusKey] || {};
    statusData[statusKey] = {
      ...existing,
      state: 'pending',
      lastUpdated: now,
    };
  }
  fs.writeFileSync(statusFile, JSON.stringify(statusData, null, 2), 'utf8');
  console.log(`📝 doc-status.json updated: suggestion ${id} rejected for ${targets.length} doc(s)`);
}

module.exports = { resolveArtifactPath, acceptSuggestion, rejectSuggestion };
