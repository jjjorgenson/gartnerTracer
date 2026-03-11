const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const http = require('node:http');

const DATA_DIR = path.join(__dirname, 'data');
const REPOS_FILE = path.join(DATA_DIR, 'repos.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getRepos() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(REPOS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REPOS_FILE, 'utf8'));
  } catch (_) {
    return [];
  }
}

function saveRepos(repos) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(REPOS_FILE, JSON.stringify(repos, null, 2), 'utf8');
}

function addRepo(installationId, repo, repoUrl) {
  const repos = getRepos();
  if (repos.some(function (r) { return r.repo === repo; })) return repos;
  repos.push({ installationId, repo, repoUrl: repoUrl || 'https://github.com/' + repo, addedAt: new Date().toISOString() });
  saveRepos(repos);
  return repos;
}

function repoDataDir(repo) {
  const parts = repo.split('/');
  const owner = parts[0];
  const name = parts[1];
  if (!owner || !name) return null;
  return path.join(DATA_DIR, owner, name);
}

function writeRepoData(repo, payload) {
  const dir = repoDataDir(repo);
  if (!dir) return;
  ensureDir(dir);
  if (payload.docStatus) {
    fs.writeFileSync(path.join(dir, 'doc-status.json'), JSON.stringify(payload.docStatus, null, 2), 'utf8');
  }
  if (payload.manifest) {
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(payload.manifest, null, 2), 'utf8');
  }
  const csDir = path.join(dir, 'change-summaries');
  if (payload.changeSummaries && Array.isArray(payload.changeSummaries)) {
    ensureDir(csDir);
    for (let i = 0; i < payload.changeSummaries.length; i++) {
      const cs = payload.changeSummaries[i];
      const id = cs.id || cs.commitHash || Date.now();
      fs.writeFileSync(path.join(csDir, id + '.json'), JSON.stringify(cs, null, 2), 'utf8');
    }
  }
  const duDir = path.join(dir, 'doc-updates');
  if (payload.docUpdates && Array.isArray(payload.docUpdates)) {
    ensureDir(duDir);
    for (let i = 0; i < payload.docUpdates.length; i++) {
      const du = payload.docUpdates[i];
      const id = du.id || Date.now();
      fs.writeFileSync(path.join(duDir, id + '.json'), JSON.stringify(du, null, 2), 'utf8');
    }
  }
}

function fetchUrl(urlStr) {
  return new Promise(function (resolve, reject) {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    mod.get(urlStr, { headers: { 'User-Agent': 'Tracer-Backend/1.0' } }, function (res) {
      if (res.statusCode !== 200) {
        reject(new Error('HTTP ' + res.statusCode));
        return;
      }
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () { resolve(Buffer.concat(chunks)); });
    }).on('error', reject);
  });
}

function getUsers() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(USERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (_) {
    return {};
  }
}

function saveUsers(users) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function getReposForUser(githubId) {
  const users = getUsers();
  const u = users[String(githubId)];
  return (u && u.repos) ? u.repos : [];
}

function addReposForUser(githubId, login, reposToAdd) {
  const users = getUsers();
  const id = String(githubId);
  if (!users[id]) users[id] = { login, repos: [] };
  const existing = new Set(users[id].repos.map(function (r) { return r.repo; }));
  for (let i = 0; i < reposToAdd.length; i++) {
    const r = reposToAdd[i];
    const repo = r.full_name || r.repo || (r.owner && r.name ? r.owner.login + '/' + r.name : null);
    if (repo && !existing.has(repo)) {
      existing.add(repo);
      users[id].repos.push({
        repo: repo,
        repoUrl: r.html_url || ('https://github.com/' + repo),
        installationId: r.installationId,
      });
    }
  }
  users[id].login = login || users[id].login;
  saveUsers(users);
  return users[id].repos;
}

function removeRepoForUser(githubId, owner, repo) {
  const fullRepo = owner + '/' + repo;
  const users = getUsers();
  const id = String(githubId);
  if (!users[id]) return;
  users[id].repos = users[id].repos.filter(function (r) { return r.repo !== fullRepo; });
  saveUsers(users);
}

module.exports = { getRepos, getReposForUser, addRepo, addReposForUser, removeRepoForUser, repoDataDir, writeRepoData, ensureDir, fetchUrl, DATA_DIR };
