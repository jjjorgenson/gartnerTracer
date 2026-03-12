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
    mod.get(urlStr, { headers: { 'User-Agent': 'AutoDocs-Backend/1.0' } }, function (res) {
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

function ensureUser(users, githubId, login) {
  const id = String(githubId);
  if (!users[id]) users[id] = { login: login || null, repos: [], availableRepos: [], installationIds: [] };
  if (!Array.isArray(users[id].repos)) users[id].repos = [];
  if (!Array.isArray(users[id].availableRepos)) users[id].availableRepos = [];
  if (!Array.isArray(users[id].installationIds)) users[id].installationIds = [];
  users[id].login = login || users[id].login || null;
  return users[id];
}

function normalizeRepoRecord(repoLike) {
  const repo = repoLike.full_name || repoLike.repo || (repoLike.owner && repoLike.name ? repoLike.owner.login + '/' + repoLike.name : null);
  if (!repo) return null;
  return {
    repo: repo,
    repoUrl: repoLike.html_url || repoLike.repoUrl || ('https://github.com/' + repo),
    installationId: repoLike.installationId || null,
  };
}

function mergeRepoRecords(existingRecords, reposToMerge) {
  const byRepo = new Map();
  for (let i = 0; i < existingRecords.length; i++) {
    const record = normalizeRepoRecord(existingRecords[i]);
    if (record) byRepo.set(record.repo, record);
  }
  for (let i = 0; i < reposToMerge.length; i++) {
    const record = normalizeRepoRecord(reposToMerge[i]);
    if (!record) continue;
    const existing = byRepo.get(record.repo);
    byRepo.set(record.repo, {
      ...(existing || {}),
      ...record,
    });
  }
  return Array.from(byRepo.values()).sort(function (a, b) {
    return a.repo.localeCompare(b.repo);
  });
}

function getReposForUser(githubId) {
  const users = getUsers();
  const u = users[String(githubId)];
  return (u && u.repos) ? u.repos : [];
}

function getAvailableReposForUser(githubId) {
  const users = getUsers();
  const u = users[String(githubId)];
  return (u && u.availableRepos) ? u.availableRepos : [];
}

function getInstallationIdsForUser(githubId) {
  const users = getUsers();
  const u = users[String(githubId)];
  return (u && u.installationIds) ? u.installationIds : [];
}

function addInstallationIdForUser(githubId, login, installationId) {
  if (!installationId) return [];
  const users = getUsers();
  const user = ensureUser(users, githubId, login);
  const normalized = String(installationId);
  if (!user.installationIds.includes(normalized)) {
    user.installationIds.push(normalized);
    user.installationIds.sort();
    saveUsers(users);
  }
  return user.installationIds;
}

function saveAvailableReposForUser(githubId, login, reposToAdd) {
  const users = getUsers();
  const user = ensureUser(users, githubId, login);
  user.availableRepos = mergeRepoRecords([], reposToAdd);
  for (let i = 0; i < user.availableRepos.length; i++) {
    const installationId = user.availableRepos[i].installationId;
    if (installationId && !user.installationIds.includes(installationId)) {
      user.installationIds.push(installationId);
    }
  }
  user.installationIds.sort();
  saveUsers(users);
  return user.availableRepos;
}

function addReposForUser(githubId, login, reposToAdd) {
  const users = getUsers();
  const user = ensureUser(users, githubId, login);
  user.repos = mergeRepoRecords(user.repos, reposToAdd);
  saveUsers(users);
  return user.repos;
}

function removeRepoForUser(githubId, owner, repo) {
  const fullRepo = owner + '/' + repo;
  const users = getUsers();
  const id = String(githubId);
  if (!users[id]) return;
  users[id].repos = users[id].repos.filter(function (r) { return r.repo !== fullRepo; });
  saveUsers(users);
}

module.exports = {
  getRepos,
  getReposForUser,
  getAvailableReposForUser,
  getInstallationIdsForUser,
  addRepo,
  addReposForUser,
  addInstallationIdForUser,
  saveAvailableReposForUser,
  removeRepoForUser,
  repoDataDir,
  writeRepoData,
  ensureDir,
  fetchUrl,
  DATA_DIR,
};
