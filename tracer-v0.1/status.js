/**
 * AutoDocs v0.1 - status command (TRD Epic 4.3).
 * Reads doc-status.json and optional manifest; prints doc freshness.
 */
const fs = require('node:fs');
const path = require('node:path');
const { getTracerDir } = require('./delivery');

function loadDocStatus() {
  const tracerDir = getTracerDir();
  const statusPath = path.join(tracerDir, 'doc-status.json');
  if (!fs.existsSync(statusPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function loadManifestPaths(manifestPath) {
  manifestPath = manifestPath || 'tracer.manifest.yaml';
  const cwd = process.cwd();
  const p = path.isAbsolute(manifestPath) ? manifestPath : path.join(cwd, manifestPath);
  if (!fs.existsSync(p)) return [];
  try {
    const yaml = require('js-yaml');
    const doc = yaml.load(fs.readFileSync(p, 'utf8'));
    if (!doc) return [];
    const docs = doc.docs || [];
    const mappings = doc.mappings || [];
    const fromMappings = mappings.flatMap(function (m) { return m.docs || []; });
    const all = docs.concat(fromMappings);
    return all.map(function (d) { return typeof d === 'string' ? d : d.path; }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function runStatus(opts) {
  opts = opts || {};
  const status = loadDocStatus();
  const manifestPath = opts.manifest || 'tracer.manifest.yaml';
  const trackedPaths = loadManifestPaths(manifestPath);

  if (!status) {
    console.log('No doc-status.json found (run from repo root with .tracer or set TRACER_OUTPUT_DIR).');
    return;
  }

  const repo = status.repo || '(no repo)';
  const docEntries = Object.entries(status).filter(function (kv) { return kv[0] !== 'repo' && kv[0] !== 'branch'; });
  if (docEntries.length === 0) {
    console.log('Repo:', repo);
    console.log('No docs in doc-status.');
    if (trackedPaths.length > 0) console.log('Manifest tracks:', trackedPaths.join(', '));
    return;
  }

  console.log('Repo:', repo);
  console.log('');
  console.log('Doc freshness:');
  for (let i = 0; i < docEntries.length; i++) {
    const docKey = docEntries[i][0];
    const entry = docEntries[i][1];
    const state = entry.state || 'unknown';
    const lastCommit = entry.lastVerifiedCommit ? entry.lastVerifiedCommit.slice(0, 7) : '-';
    const lastUpdated = entry.lastUpdated || '-';
    const staleReason = entry.staleReason ? ' (' + entry.staleReason + ')' : '';
    console.log('  ' + docKey + ': ' + state + '  lastVerified: ' + lastCommit + '  lastUpdated: ' + lastUpdated + staleReason);
  }
  if (trackedPaths.length > 0) {
    console.log('');
    console.log('Manifest tracks:', trackedPaths.join(', '));
  }
}

module.exports = { runStatus, loadDocStatus, loadManifestPaths };
