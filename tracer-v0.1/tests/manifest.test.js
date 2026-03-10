/**
 * Unit tests for manifest resolution: precedence, dedupe, rank, max docs (TRD §4.1)
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { resolveTargets, normalizeMapping, MAX_DOCS_PER_RUN } = require('../manifest.js');

describe('normalizeMapping', () => {
  it('normalizes legacy path + docs', () => {
    const out = normalizeMapping({ path: 'src/**/*.js', docs: ['docs/a.md'] }, 0);
    assert.deepStrictEqual(out.codePaths, ['src/**/*.js']);
    assert.deepStrictEqual(out.docPaths, ['docs/a.md']);
    assert.strictEqual(out.strategy, 'suggest');
  });

  it('normalizes TRD code.paths + docs[].path', () => {
    const out = normalizeMapping({
      code: { paths: ['lib/*.js', 'src/*.js'] },
      docs: [{ path: 'docs/b.md', type: 'repo' }],
      strategy: 'pr-comment'
    }, 1);
    assert.deepStrictEqual(out.codePaths, ['lib/*.js', 'src/*.js']);
    assert.deepStrictEqual(out.docPaths, ['docs/b.md']);
    assert.strictEqual(out.strategy, 'pr-comment');
  });
});

describe('resolveTargets', () => {
  it('returns empty when no mappings match', () => {
    const manifest = {
      mappings: [{ path: 'src/**/*.js', docs: ['docs/a.md'] }]
    };
    const { docPaths, warnings } = resolveTargets(['other/file.txt'], manifest);
    assert.strictEqual(docPaths.length, 0);
    assert.strictEqual(warnings.length, 0);
  });

  it('returns matched doc with legacy manifest', () => {
    const manifest = {
      mappings: [
        { path: 'src/**/*.js', docs: ['docs/architecture.md'] },
        { path: 'database/schema.sql', docs: ['docs/database.md'] }
      ]
    };
    const { docPaths, strategyByDoc } = resolveTargets(['src/auth.js'], manifest);
    assert.deepStrictEqual(docPaths, ['docs/architecture.md']);
    assert.strictEqual(strategyByDoc.get('docs/architecture.md'), 'suggest');
  });

  it('exact path wins over glob', () => {
    const manifest = {
      mappings: [
        { path: 'src/**/*.js', docs: ['docs/all-js.md'] },
        { path: 'src/auth.js', docs: ['docs/auth.md'] }
      ]
    };
    const { docPaths } = resolveTargets(['src/auth.js'], manifest);
    assert.ok(docPaths.includes('docs/auth.md'));
    assert.ok(docPaths.includes('docs/all-js.md') || docPaths.length === 1);
  });

  it('ranked by contributing file count', () => {
    const manifest = {
      mappings: [
        { path: 'src/**/*.js', docs: ['docs/a.md'] },
        { path: 'lib/**/*.js', docs: ['docs/b.md'] }
      ]
    };
    const { docPaths } = resolveTargets(['src/1.js', 'src/2.js', 'lib/1.js'], manifest);
    assert.strictEqual(docPaths[0], 'docs/a.md');
    assert.strictEqual(docPaths[1], 'docs/b.md');
  });

  it('caps at MAX_DOCS_PER_RUN and adds warning', () => {
    const mappings = Array.from({ length: 15 }, (_, i) => ({
      path: 'src/**/*.js',
      docs: [`docs/d${i}.md`]
    }));
    const manifest = { mappings };
    const { docPaths, warnings } = resolveTargets(['src/foo.js'], manifest);
    assert.strictEqual(docPaths.length, MAX_DOCS_PER_RUN);
    assert.ok(warnings.some(w => w.includes('Max docs per run')));
    assert.ok(warnings.some(w => w.includes('skipped')));
  });

  it('returns strategyByDoc for each selected doc', () => {
    const manifest = {
      mappings: [
        { path: 'src/**/*.js', docs: ['docs/a.md'], strategy: 'pr-comment' },
        { path: 'lib/**/*.js', docs: ['docs/b.md'] }
      ]
    };
    const { docPaths, strategyByDoc } = resolveTargets(['src/x.js', 'lib/y.js'], manifest);
    assert.strictEqual(strategyByDoc.get('docs/a.md'), 'pr-comment');
    assert.strictEqual(strategyByDoc.get('docs/b.md'), 'suggest');
  });
});
