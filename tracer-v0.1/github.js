/**
 * TRACER v0.1 - GitHub delivery adapter (pr-comment)
 * Posts doc suggestion as a PR comment. Uses GITHUB_TOKEN and GITHUB_EVENT_PATH in CI.
 */

const fs = require('node:fs');
const path = require('node:path');

async function postPrComment(body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN is required for pr-comment delivery');
  }

  let repo = process.env.GITHUB_REPOSITORY;
  let prNumber = process.env.PR_NUMBER;

  if (!prNumber || !repo) {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (eventPath && fs.existsSync(eventPath)) {
      const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
      prNumber = event.pull_request?.number;
      repo = event.repository?.full_name || event.repository?.name;
    }
  }

  if (!prNumber) {
    throw new Error('Could not determine PR number (set PR_NUMBER or run in pull_request workflow)');
  }
  if (!repo) {
    throw new Error('Could not determine repository (set GITHUB_REPOSITORY or run in GitHub Actions)');
  }

  const [owner, repoName] = repo.split('/');
  const url = `https://api.github.com/repos/${owner}/${repoName}/issues/${prNumber}/comments`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.html_url;
}

module.exports = { postPrComment };
