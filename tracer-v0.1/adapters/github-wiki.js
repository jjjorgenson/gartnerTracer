/**
 * TRACER - GitHub Wiki DocPlatformAdapter
 * Implements read/write/list/getHistory against the wiki git repo (owner/repo.wiki.git).
 * All access is via git clone/push -- GitHub has no REST API for wiki content.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const SPECIAL_FILES = new Set(['_Sidebar.md', '_Footer.md', '_Header.md']);

class GitHubWikiAdapter {
  /**
   * @param {object} opts
   * @param {string} opts.repo          - "owner/repo"
   * @param {string} [opts.token]       - GitHub token for auth (GITHUB_TOKEN)
   * @param {string} [opts.cacheDir]    - Directory to cache the wiki checkout
   * @param {string} [opts.authorName]  - Git commit author name
   * @param {string} [opts.authorEmail] - Git commit author email
   */
  constructor(opts = {}) {
    this.repo = opts.repo || process.env.GITHUB_REPOSITORY;
    if (!this.repo) {
      throw new Error('GitHubWikiAdapter: repo is required (pass opts.repo or set GITHUB_REPOSITORY)');
    }

    this.token = opts.token || process.env.GITHUB_TOKEN;
    this.authorName = opts.authorName || 'AutoDocs Agent';
    this.authorEmail = opts.authorEmail || 'tracer@noreply.dev';

    this.cacheDir = opts.cacheDir
      || process.env.TRACER_WIKI_CACHE
      || path.join(os.tmpdir(), `tracer-wiki-${crypto.createHash('md5').update(this.repo).digest('hex')}`);

    this._cloned = false;
  }

  get wikiUrl() {
    if (this.token) {
      return `https://x-access-token:${this.token}@github.com/${this.repo}.wiki.git`;
    }
    return `https://github.com/${this.repo}.wiki.git`;
  }

  _exec(cmd, opts = {}) {
    const cwd = opts.cwd || this.cacheDir;
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: this.authorName,
      GIT_AUTHOR_EMAIL: this.authorEmail,
      GIT_COMMITTER_NAME: this.authorName,
      GIT_COMMITTER_EMAIL: this.authorEmail,
    };
    return execSync(cmd, { cwd, encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'], ...opts });
  }

  /**
   * Ensure the wiki repo is cloned locally. Clone once per adapter lifetime;
   * subsequent calls pull latest.
   */
  ensureClone() {
    if (this._cloned && fs.existsSync(path.join(this.cacheDir, '.git'))) {
      try {
        this._exec('git pull --rebase --quiet');
      } catch {
        // pull may fail if remote has no commits yet
      }
      return;
    }

    if (fs.existsSync(path.join(this.cacheDir, '.git'))) {
      try {
        this._exec('git pull --rebase --quiet');
        this._cloned = true;
        return;
      } catch {
        fs.rmSync(this.cacheDir, { recursive: true, force: true });
      }
    }

    fs.mkdirSync(this.cacheDir, { recursive: true });
    try {
      this._exec(`git clone --quiet "${this.wikiUrl}" .`, { cwd: this.cacheDir });
    } catch (err) {
      if (err.message && (err.message.includes('empty') || err.message.includes('not found')
          || err.message.includes('does not appear to be a git repository'))) {
        this._exec('git init', { cwd: this.cacheDir });
        this._exec(`git remote add origin "${this.wikiUrl}"`, { cwd: this.cacheDir });
      } else {
        throw err;
      }
    }
    this._cloned = true;
  }

  /**
   * Initialise from a local directory (for testing without a remote).
   * @param {string} dir - path to local git repo acting as wiki
   */
  initFromLocal(dir) {
    this.cacheDir = dir;
    this._cloned = true;
  }

  /**
   * Read a wiki page's markdown content.
   * @param {string} pageSlug - e.g. "API-Reference" (without .md)
   * @returns {string|null} markdown content, or null if page doesn't exist
   */
  read(pageSlug) {
    this.ensureClone();
    const filePath = path.join(this.cacheDir, `${pageSlug}.md`);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  }

  /**
   * Write (create or update) a wiki page and push to remote.
   * @param {string} pageSlug - e.g. "API-Reference"
   * @param {string} content  - markdown content
   * @param {string} message  - git commit message
   * @returns {{ committed: boolean, pushed: boolean }}
   */
  write(pageSlug, content, message) {
    this.ensureClone();
    const filePath = path.join(this.cacheDir, `${pageSlug}.md`);
    fs.writeFileSync(filePath, content, 'utf8');

    this._exec(`git add "${pageSlug}.md"`);

    try {
      this._exec('git diff --cached --quiet');
      return { committed: false, pushed: false };
    } catch {
      // diff --quiet exits non-zero when there ARE staged changes
    }

    this._exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);

    let pushed = false;
    try {
      this._exec('git push origin HEAD');
      pushed = true;
    } catch (err) {
      console.warn(`\u26a0\ufe0f [WikiAdapter] Push failed: ${err.message}`);
    }

    return { committed: true, pushed };
  }

  /**
   * List all wiki pages (excluding special files like _Sidebar.md).
   * @returns {string[]} array of page slugs
   */
  list() {
    this.ensureClone();
    if (!fs.existsSync(this.cacheDir)) return [];

    const files = fs.readdirSync(this.cacheDir);
    return files
      .filter(f => f.endsWith('.md') && !SPECIAL_FILES.has(f))
      .map(f => f.replace(/\.md$/, ''));
  }

  /**
   * Get version history for a specific page via git log.
   * @param {string} pageSlug
   * @param {number} [limit=20]
   * @returns {Array<{ sha: string, message: string, author: string, date: string }>}
   */
  getHistory(pageSlug, limit = 20) {
    this.ensureClone();

    try {
      const separator = '__|__';
      const log = this._exec(
        `git log --follow --format="%H${separator}%s${separator}%an${separator}%aI" -${limit} -- "${pageSlug}.md"`
      );
      return log.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split(separator);
        return { sha: parts[0], message: parts[1], author: parts[2], date: parts[3] };
      });
    } catch {
      return [];
    }
  }

  /**
   * Read the _Sidebar.md content.
   * @returns {string|null}
   */
  readSidebar() {
    this.ensureClone();
    const filePath = path.join(this.cacheDir, '_Sidebar.md');
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  }

  /**
   * Write _Sidebar.md and push.
   * @param {string} content
   * @param {string} [message]
   * @returns {{ committed: boolean, pushed: boolean }}
   */
  writeSidebar(content, message = 'AutoDocs: update sidebar navigation') {
    this.ensureClone();
    const filePath = path.join(this.cacheDir, '_Sidebar.md');
    fs.writeFileSync(filePath, content, 'utf8');

    this._exec('git add "_Sidebar.md"');

    try {
      this._exec('git diff --cached --quiet');
      return { committed: false, pushed: false };
    } catch {
      // staged changes exist
    }

    this._exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);

    let pushed = false;
    try {
      this._exec('git push origin HEAD');
      pushed = true;
    } catch (err) {
      console.warn(`\u26a0\ufe0f [WikiAdapter] Sidebar push failed: ${err.message}`);
    }

    return { committed: true, pushed };
  }

  /**
   * Write a page + update sidebar in a single commit/push.
   * @param {string} pageSlug
   * @param {string} content
   * @param {string} sidebarContent
   * @param {string} message
   * @returns {{ committed: boolean, pushed: boolean }}
   */
  writeWithSidebar(pageSlug, content, sidebarContent, message) {
    this.ensureClone();

    fs.writeFileSync(path.join(this.cacheDir, `${pageSlug}.md`), content, 'utf8');
    fs.writeFileSync(path.join(this.cacheDir, '_Sidebar.md'), sidebarContent, 'utf8');

    this._exec(`git add "${pageSlug}.md" "_Sidebar.md"`);

    try {
      this._exec('git diff --cached --quiet');
      return { committed: false, pushed: false };
    } catch {
      // staged changes exist
    }

    this._exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);

    let pushed = false;
    try {
      this._exec('git push origin HEAD');
      pushed = true;
    } catch (err) {
      console.warn(`\u26a0\ufe0f [WikiAdapter] Push failed: ${err.message}`);
    }

    return { committed: true, pushed };
  }

  /** Clean up the cache directory. */
  cleanup() {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true, force: true });
      this._cloned = false;
    }
  }
}

module.exports = { GitHubWikiAdapter, SPECIAL_FILES };
