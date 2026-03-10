/**
 * TRACER v0.1 - Manifest resolver (TRD §3.4, §4.1)
 * Supports both legacy (path + docs) and TRD (code.paths + docs[].path) formats.
 * Precedence: exact path > narrower glob > later entry. Max docs per run with warnings.
 */

const { minimatch } = require('minimatch');

const MAX_DOCS_PER_RUN = parseInt(process.env.TRACER_MAX_DOCS_PER_RUN || '10', 10);

/**
 * Normalize a raw manifest mapping to { codePaths, docs, strategy }.
 * Legacy: { path, docs: string[] } -> codePaths [path], docs from docs.
 * TRD: { code: { paths }, docs: [{ path, type? }], strategy? } -> codePaths, docs from docs[].
 */
function normalizeMapping(entry, index) {
  const codePaths = entry.code?.paths ? [...entry.code.paths] : (entry.path ? [entry.path] : []);

  const rawDocs = entry.docs || [];
  const docs = rawDocs.map(d => {
    if (typeof d === 'string') return { path: d, type: 'repo' };
    return { path: d.path, type: d.type || 'repo', metadata: d.metadata };
  }).filter(d => d.path);

  const docPaths = docs.map(d => d.path);
  const strategy = entry.strategy || 'suggest';
  return { codePaths, docPaths, docs, strategy, _index: index };
}

/**
 * Glob specificity: lower = more specific. Exact path = 0, then by number of * and **.
 */
function globSpecificity(pattern) {
  if (!pattern || !pattern.includes('*')) return 0;
  let n = 0;
  n += (pattern.match(/\*\*/g) || []).length * 2;
  n += (pattern.match(/\*/g) || []).length;
  return n;
}

/**
 * For one changed file, which mapping(s) win? Precedence: exact > narrower glob > later.
 * Returns array of normalized mapping indices (or mapping refs) to use.
 */
function selectMappingsForFile(file, normalizedMappings) {
  const matches = [];
  for (let i = 0; i < normalizedMappings.length; i++) {
    const m = normalizedMappings[i];
    for (const codePath of m.codePaths) {
      if (minimatch(file, codePath)) {
        const exact = !codePath.includes('*');
        const specificity = globSpecificity(codePath);
        matches.push({ index: i, exact, specificity, codePath });
        break;
      }
    }
  }
  if (matches.length === 0) return [];
  matches.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (a.specificity !== b.specificity) return a.specificity - b.specificity;
    return b.index - a.index; // later entry wins
  });
  const top = matches[0];
  const tied = matches.filter(x => x.exact === top.exact && x.specificity === top.specificity);
  return [...new Set(tied.map(x => x.index))];
}

/**
 * Resolve changed files to doc targets with precedence and max-docs cap.
 * Returns { docPaths: string[], warnings: string[] }.
 */
function resolveTargets(changedFiles, rawManifest) {
  const mappings = rawManifest.mappings || [];
  const normalizedMappings = mappings.map((m, i) => normalizeMapping(m, i));

  const docToContributingFiles = new Map();
  const docToStrategy = new Map();
  const docToType = new Map();

  for (const file of changedFiles) {
    const winningIndices = selectMappingsForFile(file, normalizedMappings);
    for (const idx of winningIndices) {
      const m = normalizedMappings[idx];
      for (const doc of m.docs) {
        if (!docToContributingFiles.has(doc.path)) {
          docToContributingFiles.set(doc.path, new Set());
          docToContributingFiles.get(doc.path).add(file);
          docToStrategy.set(doc.path, m.strategy);
          docToType.set(doc.path, doc.type || 'repo');
        } else {
          docToContributingFiles.get(doc.path).add(file);
        }
      }
    }
  }

  const docPaths = [...docToContributingFiles.keys()];
  if (docPaths.length === 0) {
    return { docPaths: [], warnings: [], strategyByDoc: new Map(), docTypeByDoc: new Map() };
  }

  const ranked = docPaths
    .map(p => ({ path: p, count: docToContributingFiles.get(p).size }))
    .sort((a, b) => b.count - a.count);

  const warnings = [];
  let selected = ranked;
  if (ranked.length > MAX_DOCS_PER_RUN) {
    selected = ranked.slice(0, MAX_DOCS_PER_RUN);
    const skipped = ranked.slice(MAX_DOCS_PER_RUN).map(x => x.path);
    warnings.push(`Max docs per run (${MAX_DOCS_PER_RUN}) reached; skipped: ${skipped.join(', ')}`);
  }

  const strategyByDoc = new Map();
  const docTypeByDoc = new Map();
  selected.forEach(x => {
    strategyByDoc.set(x.path, docToStrategy.get(x.path) || 'suggest');
    docTypeByDoc.set(x.path, docToType.get(x.path) || 'repo');
  });

  return {
    docPaths: selected.map(x => x.path),
    warnings,
    strategyByDoc,
    docTypeByDoc,
  };
}

module.exports = { resolveTargets, normalizeMapping, MAX_DOCS_PER_RUN };
