/**
 * GitHub OAuth (user login) and session helpers.
 */
const https = require('node:https');

const GITHUB_OAUTH_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID;
const GITHUB_OAUTH_CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET;

function getLoginUrl(redirectUri, state) {
  if (!GITHUB_OAUTH_CLIENT_ID) return null;
  const params = new URLSearchParams({
    client_id: GITHUB_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'read:user',
    state: state || '',
  });
  return 'https://github.com/login/oauth/authorize?' + params.toString();
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (_) {
          reject(new Error('Invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, accessToken) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Tracer-Backend',
        'Authorization': 'Bearer ' + accessToken,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (_) {
          reject(new Error('Invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function exchangeCodeForToken(code, redirectUri) {
  if (!GITHUB_OAUTH_CLIENT_SECRET) throw new Error('OAuth not configured');
  const body = {
    client_id: GITHUB_OAUTH_CLIENT_ID,
    client_secret: GITHUB_OAUTH_CLIENT_SECRET,
    code,
    redirect_uri: redirectUri,
  };
  const res = await post('https://github.com/login/oauth/access_token', body);
  if (res.error) throw new Error(res.error_description || res.error);
  return res.access_token;
}

async function getGitHubUser(accessToken) {
  const user = await get('https://api.github.com/user', accessToken);
  return { id: user.id, login: user.login, avatar_url: user.avatar_url };
}

module.exports = { getLoginUrl, exchangeCodeForToken, getGitHubUser };
