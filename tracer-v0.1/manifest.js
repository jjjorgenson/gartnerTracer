/**
 * TRACER v0.1 - Manifest resolver (TRD §3.4, §4.1)
 * Supports both legacy (path + docs) and TRD (code.paths + docs[].path) formats.
 * Precedence: exact path > narrower glob > later entry. Max docs per run with warnings.
 */

const { minimatch } = require('minimatch');

const MAX_DOCS_PER_RUN = parseInt(process.env.TRACER_MAX_DOCS_PER_RUN || '10', 10);

/**
 * Normalize a raw manifest mapping to { codePaths, docPaths, strategy }.
 * Legacy: { path, docs: string[] } -> codePaths [path], docPaths from docs.
 * TRD: { code: { paths }, docs: [{ path, type? }], strategy? } -> codePaths, docPaths from docs[].path.
 */
function normalizeMapping(entry, index) {
  const codePaths = entry.code?.paths ? [...entry.code.paths] : (entry.path ? [entry.path] : []);
  const docPaths = (entry.docs || []).map(d => (typeof d === 'string' ? d : d.path)).filter(Boolean);
  const strategy = entry.strategy || 'suggest';
  return { codePaths, docPaths, strategy, _index: index };
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

  for (const file of changedFiles) {
    const winningIndices = selectMappingsForFile(file, normalizedMappings);
    for (const idx of winningIndices) {
      const m = normalizedMappings[idx];
      for (const docPath of m.docPaths) {
        if (!docToContributingFiles.has(docPath)) {
          docToContributingFiles.set(docPath, new Set());
          docToContributingFiles.get(docPath).add(file);
          docToStrategy.set(docPath, m.strategy);
        } else {
          docToContributingFiles.get(docPath).add(file);
        }
      }
    }
  }

  const docPaths = [...docToContributingFiles.keys()];
  if (docPaths.length === 0) {
    return { docPaths: [], warnings: [], strategyByDoc: new Map() };
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
  selected.forEach(x => strategyByDoc.set(x.path, docToStrategy.get(x.path) || 'suggest'));

  return {
    docPaths: selected.map(x => x.path),
    warnings,
    strategyByDoc
  };
}

module.exports = { resolveTargets, normalizeMapping, MAX_DOCS_PER_RUN };
