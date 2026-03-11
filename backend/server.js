/**
 * Tracer dashboard backend: OAuth, GitHub App, webhook ingest, API for repos and data.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieSession = require('cookie-session');
const store = require('./store');
const auth = require('./auth');

const app = express();
const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_APP_CLIENT_ID = process.env.GITHUB_APP_CLIENT_ID;
const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;
const DASHBOARD_ORIGIN = process.env.DASHBOARD_ORIGIN || 'http://localhost:5174';
const SESSION_SECRET = process.env.SESSION_SECRET || 'tracer-dev-secret-change-in-production';

// CORS first so credentials work
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', DASHBOARD_ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(cookieSession({
  name: 'tracer_session',
  secret: SESSION_SECRET,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
}));

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Health (no auth)
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// OAuth: redirect to GitHub login
app.get('/api/auth/login', (req, res) => {
  const redirectUri = req.query.redirect_uri || (DASHBOARD_ORIGIN + '/');
  const base = process.env.API_BASE || (req.protocol + '://' + req.get('host'));
  const callbackUri = base + '/api/auth/callback';
  const state = req.query.state || '';
  const url = auth.getLoginUrl(callbackUri, state);
  if (!url) return res.status(503).json({ error: 'OAuth not configured' });
  res.redirect(url);
});

// OAuth callback: exchange code, set session, redirect to dashboard
app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code;
  const base = process.env.API_BASE || (req.protocol + '://' + req.get('host'));
  const redirectUri = base + '/api/auth/callback';
  if (!code) {
    return res.redirect(DASHBOARD_ORIGIN + '?auth_error=no_code');
  }
  try {
    const token = await auth.exchangeCodeForToken(code, redirectUri);
    const user = await auth.getGitHubUser(token);
    req.session.user = { id: user.id, login: user.login, avatar_url: user.avatar_url };
    res.redirect(DASHBOARD_ORIGIN + '?auth=ok');
  } catch (err) {
    res.redirect(DASHBOARD_ORIGIN + '?auth_error=' + encodeURIComponent(err.message));
  }
});

// Logout
app.get('/api/auth/logout', (req, res) => {
  req.session = null;
  res.redirect(DASHBOARD_ORIGIN);
});

// Current user (requires session from cookie; dashboard calls with credentials)
app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});

// List connected repos (per user)
app.get('/api/repos', requireAuth, (req, res) => {
  const repos = store.getReposForUser(req.session.user.id);
  res.json(repos);
});

// Get data for one repo (manifest + doc-status + list of ids)
app.get('/api/repos/:owner/:repo/data', requireAuth, (req, res) => {
  const userRepos = store.getReposForUser(req.session.user.id);
  const fullRepo = req.params.owner + '/' + req.params.repo;
  if (!userRepos.some(function (r) { return r.repo === fullRepo; })) {
    return res.status(403).json({ error: 'Repo not connected to your account' });
  }
  const dir = store.repoDataDir(fullRepo);
  if (!dir || !fs.existsSync(dir)) {
    return res.status(404).json({ error: 'No data for this repo' });
  }
  const manifestPath = path.join(dir, 'manifest.json');
  const statusPath = path.join(dir, 'doc-status.json');
  const csDir = path.join(dir, 'change-summaries');
  const duDir = path.join(dir, 'doc-updates');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { changeSummaryIds: [], docUpdateIds: [] };
  const docStatus = fs.existsSync(statusPath)
    ? JSON.parse(fs.readFileSync(statusPath, 'utf8')) : {};
  if (fs.existsSync(csDir) && !manifest.changeSummaryIds?.length) {
    manifest.changeSummaryIds = fs.readdirSync(csDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  }
  if (fs.existsSync(duDir) && !manifest.docUpdateIds?.length) {
    manifest.docUpdateIds = fs.readdirSync(duDir).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  }
  res.json({ manifest, docStatus });
});

// Get one change-summary or doc-update
app.get('/api/repos/:owner/:repo/change-summaries/:id', requireAuth, (req, res) => {
  const userRepos = store.getReposForUser(req.session.user.id);
  const fullRepo = req.params.owner + '/' + req.params.repo;
  if (!userRepos.some(function (r) { return r.repo === fullRepo; })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const file = path.join(store.repoDataDir(`${req.params.owner}/${req.params.repo}`), 'change-summaries', `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});
app.get('/api/repos/:owner/:repo/doc-updates/:id', requireAuth, (req, res) => {
  const userRepos = store.getReposForUser(req.session.user.id);
  const fullRepo = req.params.owner + '/' + req.params.repo;
  if (!userRepos.some(function (r) { return r.repo === fullRepo; })) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const file = path.join(store.repoDataDir(`${req.params.owner}/${req.params.repo}`), 'doc-updates', `${req.params.id}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
});

// Webhook ingest: POST { repo, commitHash, artifactUrl? } or { repo, docStatus?, changeSummaries?, docUpdates?, manifest? }
app.post('/webhook/ingest', async (req, res) => {
  try {
    const { repo, commitHash, artifactUrl, docStatus, changeSummaries, docUpdates, manifest } = req.body || {};
    if (!repo || typeof repo !== 'string') {
      return res.status(400).json({ error: 'repo required' });
    }
    let payload = { docStatus, changeSummaries, docUpdates, manifest };
    if (artifactUrl) {
      const buf = await store.fetchUrl(artifactUrl);
      const data = buf.toString('utf8');
      try {
        const parsed = JSON.parse(data);
        payload = { docStatus: parsed.docStatus || parsed['doc-status'], changeSummaries: parsed.changeSummaries, docUpdates: parsed.docUpdates, manifest: parsed.manifest };
      } catch (_) {
        return res.status(400).json({ error: 'artifact response not valid JSON' });
      }
    }
    store.writeRepoData(repo, payload);
    res.json({ ok: true, repo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GitHub App install redirect (state = githubId so we can associate repos with user)
app.get('/api/auth/install', (req, res) => {
  if (!GITHUB_APP_CLIENT_ID) {
    return res.status(503).json({ error: 'GitHub App not configured' });
  }
  const state = req.query.state || '';
  const redirect = 'https://github.com/apps/' + (process.env.GITHUB_APP_SLUG || 'tracer') + '/installations/new?client_id=' + GITHUB_APP_CLIENT_ID + '&state=' + encodeURIComponent(state);
  res.redirect(redirect);
});

// GitHub App setup callback (Setup URL in GitHub App settings -> this URL)
app.get('/api/auth/app-callback', async (req, res) => {
  const installationId = req.query.installation_id;
  const state = req.query.state || ''; // githubId from install link
  if (!installationId || !state) {
    return res.redirect(DASHBOARD_ORIGIN + '?connected=0&error=missing_params');
  }
  const githubId = state;
  let reposToAdd = [];
  if (GITHUB_APP_ID && GITHUB_APP_PRIVATE_KEY) {
    try {
      const { createAppAuth } = require('@octokit/auth-app');
      const auth = createAppAuth({
        appId: GITHUB_APP_ID,
        privateKey: GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'),
      });
      const installationAuth = await auth({ type: 'installation', installationId: installationId });
      const Octokit = require('@octokit/rest').Octokit;
      const octokit = new Octokit({ auth: installationAuth.token });
      const { data } = await octokit.rest.apps.listReposAccessibleToInstallation();
      reposToAdd = (data.repositories || []).map(function (r) {
        return { full_name: r.full_name, html_url: r.html_url, installationId: installationId };
      });
    } catch (err) {
      console.error('App callback list repos:', err.message);
    }
  }
  if (reposToAdd.length === 0 && req.query.repository_id) {
    reposToAdd = [{ repo: req.query.repository || 'unknown/repo', installationId: installationId }];
  }
  store.addReposForUser(githubId, null, reposToAdd);
  res.redirect(DASHBOARD_ORIGIN + '?connected=1');
});

// Disconnect a repo from current user
app.delete('/api/repos/:owner/:repo', requireAuth, (req, res) => {
  store.removeRepoForUser(req.session.user.id, req.params.owner, req.params.repo);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Tracer backend listening on port ${PORT}`);
});
