/**
 * Tests for GitHubWikiAdapter using a local git repo (no remote).
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');
const { GitHubWikiAdapter, SPECIAL_FILES } = require('../adapters/github-wiki');

function createLocalWikiRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracer-wiki-test-'));
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'pipe' });

  fs.writeFileSync(path.join(dir, 'Home.md'), '# Home\n\nWelcome to the wiki.\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'API-Reference.md'), '# API Reference\n\n## Endpoints\n\nGET /users\n', 'utf8');
  fs.writeFileSync(path.join(dir, '_Sidebar.md'), '* [Home](Home)\n* [API Reference](API-Reference)\n', 'utf8');

  execSync('git add -A', { cwd: dir, stdio: 'pipe' });
  execSync('git commit -m "Initial wiki pages"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

describe('GitHubWikiAdapter', () => {
  let wikiDir;
  let adapter;

  before(() => {
    wikiDir = createLocalWikiRepo();
    adapter = new GitHubWikiAdapter({ repo: 'test/repo' });
    adapter.initFromLocal(wikiDir);
  });

  after(() => {
    fs.rmSync(wikiDir, { recursive: true, force: true });
  });

  describe('read', () => {
    it('reads an existing wiki page', () => {
      const content = adapter.read('Home');
      assert.ok(content.includes('# Home'));
      assert.ok(content.includes('Welcome to the wiki'));
    });

    it('reads a page with dashes in the slug', () => {
      const content = adapter.read('API-Reference');
      assert.ok(content.includes('# API Reference'));
      assert.ok(content.includes('GET /users'));
    });

    it('returns null for non-existent page', () => {
      const content = adapter.read('Does-Not-Exist');
      assert.strictEqual(content, null);
    });
  });

  describe('write', () => {
    it('creates a new page and commits', () => {
      const result = adapter.write('New-Page', '# New Page\n\nContent here.\n', 'Add new page');
      assert.strictEqual(result.committed, true);

      const content = adapter.read('New-Page');
      assert.ok(content.includes('# New Page'));
    });

    it('updates an existing page', () => {
      const result = adapter.write('API-Reference', '# API Reference\n\n## Endpoints\n\nGET /users\nPOST /users\n', 'Update API ref');
      assert.strictEqual(result.committed, true);

      const content = adapter.read('API-Reference');
      assert.ok(content.includes('POST /users'));
    });

    it('returns committed=false when content is unchanged', () => {
      const currentContent = adapter.read('Home');
      const result = adapter.write('Home', currentContent, 'No-op write');
      assert.strictEqual(result.committed, false);
    });
  });

  describe('list', () => {
    it('lists all pages excluding special files', () => {
      const pages = adapter.list();
      assert.ok(pages.includes('Home'));
      assert.ok(pages.includes('API-Reference'));
      assert.ok(!pages.includes('_Sidebar'));
    });

    it('includes newly created pages', () => {
      adapter.write('Another-Page', '# Another\n', 'Add another');
      const pages = adapter.list();
      assert.ok(pages.includes('Another-Page'));
    });
  });

  describe('getHistory', () => {
    it('returns commit history for a page', () => {
      const history = adapter.getHistory('API-Reference');
      assert.ok(history.length >= 1);
      assert.ok(history[0].sha);
      assert.ok(history[0].message);
      assert.ok(history[0].author);
      assert.ok(history[0].date);
    });

    it('returns empty array for non-existent page', () => {
      const history = adapter.getHistory('Ghost-Page');
      assert.strictEqual(history.length, 0);
    });

    it('respects limit parameter', () => {
      adapter.write('API-Reference', '# v1\n', 'v1');
      adapter.write('API-Reference', '# v2\n', 'v2');
      adapter.write('API-Reference', '# v3\n', 'v3');
      const history = adapter.getHistory('API-Reference', 2);
      assert.strictEqual(history.length, 2);
    });
  });

  describe('readSidebar', () => {
    it('reads _Sidebar.md content', () => {
      const content = adapter.readSidebar();
      assert.ok(content.includes('[Home](Home)'));
    });
  });

  describe('writeSidebar', () => {
    it('writes and commits _Sidebar.md', () => {
      const newSidebar = '* [Home](Home)\n* [New Page](New-Page)\n';
      const result = adapter.writeSidebar(newSidebar);
      assert.strictEqual(result.committed, true);

      const content = adapter.readSidebar();
      assert.ok(content.includes('[New Page](New-Page)'));
    });
  });

  describe('writeWithSidebar', () => {
    it('writes page and sidebar in one commit', () => {
      const pageContent = '# Combined\n\nTest page.\n';
      const sidebarContent = '* [Home](Home)\n* [Combined](Combined)\n';
      const result = adapter.writeWithSidebar('Combined', pageContent, sidebarContent, 'Add combined page');
      assert.strictEqual(result.committed, true);

      assert.ok(adapter.read('Combined').includes('Test page'));
      assert.ok(adapter.readSidebar().includes('[Combined](Combined)'));
    });
  });

  describe('SPECIAL_FILES', () => {
    it('contains the expected special file names', () => {
      assert.ok(SPECIAL_FILES.has('_Sidebar.md'));
      assert.ok(SPECIAL_FILES.has('_Footer.md'));
      assert.ok(SPECIAL_FILES.has('_Header.md'));
    });
  });

  describe('constructor', () => {
    it('throws when repo is not provided', () => {
      const origRepo = process.env.GITHUB_REPOSITORY;
      delete process.env.GITHUB_REPOSITORY;
      try {
        assert.throws(() => new GitHubWikiAdapter({}), /repo is required/);
      } finally {
        if (origRepo) process.env.GITHUB_REPOSITORY = origRepo;
      }
    });

    it('constructs wikiUrl with token', () => {
      const a = new GitHubWikiAdapter({ repo: 'owner/repo', token: 'ghp_test123' });
      assert.ok(a.wikiUrl.includes('x-access-token:ghp_test123'));
      assert.ok(a.wikiUrl.endsWith('.wiki.git'));
    });

    it('constructs wikiUrl without token', () => {
      const a = new GitHubWikiAdapter({ repo: 'owner/repo', token: '' });
      assert.ok(!a.wikiUrl.includes('x-access-token'));
      assert.ok(a.wikiUrl.includes('owner/repo.wiki.git'));
    });
  });
});
