/**
 * Tests for delivery routing — especially the commit strategy with wiki docs.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

describe('deliverSuggestion', () => {
  let origOutputDir;
  let tmpDir;

  before(() => {
    origOutputDir = process.env.TRACER_OUTPUT_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracer-delivery-test-'));
    process.env.TRACER_OUTPUT_DIR = tmpDir;
  });

  after(() => {
    if (origOutputDir) process.env.TRACER_OUTPUT_DIR = origOutputDir;
    else delete process.env.TRACER_OUTPUT_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('delivers via suggest strategy (default)', async () => {
    const { deliverSuggestion } = require('../delivery');
    await deliverSuggestion(['docs/test.md'], '# Updated\n', 'suggest');

    const suggestionsDir = path.join(tmpDir, 'suggestions');
    assert.ok(fs.existsSync(suggestionsDir), 'suggestions dir should exist');

    const files = fs.readdirSync(suggestionsDir);
    assert.ok(files.length >= 1, 'should have at least one suggestion file');

    const suggestion = JSON.parse(fs.readFileSync(path.join(suggestionsDir, files[0]), 'utf8'));
    assert.deepStrictEqual(suggestion.targets, ['docs/test.md']);
    assert.strictEqual(suggestion.content, '# Updated\n');

    const statusFile = path.join(tmpDir, 'doc-status.json');
    assert.ok(fs.existsSync(statusFile));
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    assert.strictEqual(status.docs['docs/test.md'].status, 'PENDING');
  });

  it('commit strategy with repo docs falls back to suggest', async () => {
    const { deliverSuggestion } = require('../delivery');
    const docTypeByDoc = new Map([['docs/repo-doc.md', 'repo']]);
    await deliverSuggestion(['docs/repo-doc.md'], '# Repo\n', 'commit', { docTypeByDoc });

    const statusFile = path.join(tmpDir, 'doc-status.json');
    const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
    assert.strictEqual(status.docs['docs/repo-doc.md'].status, 'PENDING');
  });
});

describe('deliverToWiki', () => {
  let wikiDir;
  let origRepo;
  let origToken;
  let origCache;

  before(() => {
    wikiDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracer-wiki-delivery-'));
    execSync('git init', { cwd: wikiDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: wikiDir, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: wikiDir, stdio: 'pipe' });
    fs.writeFileSync(path.join(wikiDir, 'Home.md'), '# Home\n', 'utf8');
    execSync('git add -A && git commit -m "init"', { cwd: wikiDir, stdio: 'pipe' });

    origRepo = process.env.GITHUB_REPOSITORY;
    origToken = process.env.GITHUB_TOKEN;
    origCache = process.env.TRACER_WIKI_CACHE;
    process.env.GITHUB_REPOSITORY = 'test/delivery-repo';
    delete process.env.GITHUB_TOKEN;
    process.env.TRACER_WIKI_CACHE = wikiDir;
  });

  after(() => {
    if (origRepo) process.env.GITHUB_REPOSITORY = origRepo;
    else delete process.env.GITHUB_REPOSITORY;
    if (origToken) process.env.GITHUB_TOKEN = origToken;
    else delete process.env.GITHUB_TOKEN;
    if (origCache) process.env.TRACER_WIKI_CACHE = origCache;
    else delete process.env.TRACER_WIKI_CACHE;
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  it('writes content and commits to local wiki repo', async () => {
    const { deliverToWiki } = require('../delivery');
    const result = await deliverToWiki('Test-Page', '# Test\n\nHello!\n', {
      repo: 'test/delivery-repo',
      commitHash: 'abc1234567890',
      prNumber: '42',
    });

    assert.strictEqual(result.committed, true);

    const content = fs.readFileSync(path.join(wikiDir, 'Test-Page.md'), 'utf8');
    assert.ok(content.includes('# Test'));

    const log = execSync('git log --oneline -1', { cwd: wikiDir, encoding: 'utf8' });
    assert.ok(log.includes('Tracer: updated Test-Page'));
    assert.ok(log.includes('PR #42'));
  });
});
