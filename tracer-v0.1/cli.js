#!/usr/bin/env node

/**
 * TRACER v0.1 - Core CLI (agent | accept | reject)
 * Agent: 14-step execution lifecycle. accept/reject: mark suggestion and update doc-status.
 */

const { execSync } = require('node:child_process');

const { parseArgs } = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yaml = require('js-yaml');
const { resolveTargets } = require('./manifest');
const { callAnthropicWithRetry } = require('./ai');
const { postPrComment } = require('./github');
const { resolveArtifactPath, acceptSuggestion, rejectSuggestion } = require('./accept-reject');

const { logSpan } = require('./logger');
const { deliverSuggestion, getTracerDir } = require('./delivery');
const { validateDocUpdate } = require('./validate');
const artifacts = require('./artifacts');

// --- ARGUMENT PARSING ---
const options = {
  manifest: { type: 'string', short: 'm', default: 'tracer.manifest.yaml' },
  diff: { type: 'string', short: 'd' },
  since: { type: 'string', short: 's' },
  format: { type: 'string', short: 'f' },
  url: { type: 'string', short: 'u' }
};

let args;
try {
  args = parseArgs({ options, strict: true, allowPositionals: true });
} catch (err) {
  console.error(`❌ CLI Argument Error: ${err.message}`);
  process.exit(2);
}

const command = (args.positionals && args.positionals[0]) || 'agent';
const artifactArg = args.positionals && args.positionals[1];
const hooksSub = args.positionals && args.positionals[1];

if (command === 'hooks') {
  const { install: hooksInstall, status: hooksStatus } = require('./hooks-install.js');
  if (hooksSub === 'install') {
    hooksInstall();
    process.exit(0);
  }
  if (hooksSub === 'status') {
    hooksStatus();
    process.exit(0);
  }
  console.error('Usage: tracer hooks <install|status>');
  process.exit(2);
}

if (command === 'report') {
  const { runReport } = require('./report.js');
  const since = args.values.since || process.env.TRACER_REPORT_SINCE;
  const format = (args.values.format || 'table').toLowerCase();
  if (format !== 'table' && format !== 'json') {
    console.error('--format must be table or json');
    process.exit(2);
  }
  const out = runReport({ since, format });
  console.log(out);
  process.exit(0);
}

if (command === 'status') {
  const { runStatus } = require('./status.js');
  runStatus({ manifest: args.values.manifest });
  process.exit(0);
}

if (command === 'sync') {
  const { runSync } = require('./sync.js');
  const url = args.values.url || process.env.TRACER_SYNC_URL;
  runSync({ url }).then(function () { process.exit(0); }).catch(function (err) {
    console.error(err.message);
    process.exit(1);
  });
  return;
}

if (command === 'accept' || command === 'reject') {
  const artifactPath = resolveArtifactPath(artifactArg);
  if (!artifactPath) {
    console.error(`❌ Artifact not found: ${artifactArg || '(missing)'}. Use path to suggestion JSON or suggestion ID.`);
    process.exit(2);
  }
  try {
    if (command === 'accept') acceptSuggestion(artifactPath);
    else rejectSuggestion(artifactPath);
    process.exit(0);
  } catch (err) {
    console.error(`💥 ${command} failed: ${err.message}`);
    process.exit(1);
  }
}

const API_KEY = process.env.TRACER_PROVIDER_API_KEY;
if (!API_KEY || API_KEY === 'dummy_key') {
  console.error("❌ Missing or invalid environment variable: TRACER_PROVIDER_API_KEY");
  process.exit(2);
}

/** Get commit hash, message, author from git log -1 or GITHUB_EVENT_PATH (TRD: git context). */
function getGitContext() {
  const commitHash = process.env.GITHUB_SHA || '';
  if (process.env.GITHUB_EVENT_PATH && require('node:fs').existsSync(process.env.GITHUB_EVENT_PATH)) {
    try {
      const event = JSON.parse(require('node:fs').readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      const head = event.head_commit || event.commit || {};
      return {
        commitHash: commitHash || head.id || '',
        commitMessage: head.message || '',
        author: (head.author && (head.author.username || head.author.name)) || '',
      };
    } catch (_) { /* fall through to git */ }
  }
  try {
    const format = '%H%n%s%n%an';
    const out = execSync(`git log -1 --format=${format}`, { encoding: 'utf8' }).trim();
    const [hash, message, author] = out.split('\n');
    return { commitHash: hash || commitHash, commitMessage: message || '', author: author || '' };
  } catch (_) {
    return { commitHash, commitMessage: '', author: '' };
  }
}

/** Parse changed file paths from a unified diff (e.g. from `git diff` or -d file). */
function parseChangedFilesFromDiff(diffContent) {
  const paths = new Set();
  const lines = diffContent.split('\n');
  for (const line of lines) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) paths.add(m[2].trim()); // use "b" path (current name)
  }
  return [...paths];
}

// --- CORE LIFECYCLE ENGINE ---
async function runLifecycle() {
  const startTime = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    console.log("🚀 Starting Tracer Agent...");

    // Step 2: Load manifest
    console.log(`📂 Loading manifest: ${args.values.manifest}`);
    if (!fs.existsSync(args.values.manifest)) {
      throw new Error(`Manifest not found at ${args.values.manifest}`);
    }
    const manifest = yaml.load(fs.readFileSync(args.values.manifest, 'utf8')) || {};

    // Step 3 & 4: Detect git context & collect changed files
    console.log("🔍 Detecting git diff...");
    let changedFiles = [];
    let diffString = "";

    if (args.values.diff && fs.existsSync(args.values.diff)) {
      // CI path: read diff from file (e.g. pr.diff from workflow)
      diffString = fs.readFileSync(args.values.diff, 'utf8');
      changedFiles = parseChangedFilesFromDiff(diffString);
      if (changedFiles.length === 0) {
        console.log("⏭️ No changed files in diff. Exiting gracefully.");
        process.exit(0);
      }
    } else {
      try {
        const nameOnlyOutput = execSync('git diff --name-only HEAD', { encoding: 'utf8' });
        changedFiles = nameOnlyOutput.split('\n').filter(line => line.trim() !== '');
        diffString = execSync('git diff HEAD', { encoding: 'utf8' });
        if (changedFiles.length === 0) {
          console.log("⏭️ No git changes detected. Exiting gracefully.");
          process.exit(0);
        }
      } catch (err) {
        console.error("💥 Git integration failed. Ensure you are in a git repository with an initial commit.");
        process.exit(1);
      }
    }

    // Step 5: Resolve manifest mappings (precedence, dedupe, rank, max 10)
    console.log("\ud83d\uddfa\ufe0f Resolving manifest mappings...");
    const { docPaths: matchedDocs, warnings, strategyByDoc, docTypeByDoc } = resolveTargets(changedFiles, manifest);
    if (matchedDocs.length === 0) {
      console.log("\u23ed\ufe0f No documentation targets matched. Exiting gracefully.");
      process.exit(9);
    }
    warnings.forEach(w => console.warn(`\u26a0\ufe0f ${w}`));
    console.log(`\ud83c\udfaf Matched Documentation Targets:`, matchedDocs);

    // Step 6: Load affected documentation (process first doc; route by type)
    const docPath = matchedDocs[0];
    const docType = docTypeByDoc.get(docPath) || 'repo';
    let docContent;

    if (docType === 'github-wiki') {
      const { GitHubWikiAdapter } = require('./adapters/github-wiki');
      const wikiAdapter = new GitHubWikiAdapter();
      docContent = wikiAdapter.read(docPath);
      if (docContent === null) {
        console.log(`\ud83d\udcdd [Wiki] Page "${docPath}" doesn't exist yet, starting fresh.`);
        docContent = `# ${docPath.replace(/-/g, ' ')}\n\n`;
      }
    } else {
      docContent = fs.readFileSync(docPath, 'utf8');
    }

    // Step 7: Construct AI prompts
    const systemPrompt = `You are Tracer, an AI documentation agent. Read the code diff and existing doc, and output ONLY the updated markdown. Keep the tone technical and concise.`;
    const userPrompt = `Code diff:\n<diff>\n${diffString}\n</diff>\n\nCurrent documentation:\n<doc>\n${docContent}\n</doc>\n\nRewrite the documentation to accurately reflect the changes in the diff.`;

    // Step 8: Call AI provider with retries (1s, 4s, 16s on 429/5xx/timeout)
    console.log("🧠 Calling AI Provider (Claude Sonnet 4.6)...");
    const body = {
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    };
    const aiData = await callAnthropicWithRetry(body, API_KEY);
    const generatedMarkdown = aiData.content[0].text;
    
    // Capture token usage for the audit log
    inputTokens = aiData.usage.input_tokens;
    outputTokens = aiData.usage.output_tokens;

    // Step 9: Validate generated output (TRD §4.2 hard-reject)
    const validation = validateDocUpdate(docContent, generatedMarkdown);
    if (!validation.valid) {
      const tracerDir = getTracerDir();
      const rejectedPath = path.join(tracerDir, 'spans-rejected.jsonl');
      if (!fs.existsSync(tracerDir)) fs.mkdirSync(tracerDir, { recursive: true });
      const rejectedLine = JSON.stringify({
        timestamp: new Date().toISOString(),
        docPath,
        reasons: validation.reasons,
        originalLength: docContent.length,
        suggestedLength: (generatedMarkdown || '').length
      }) + '\n';
      fs.appendFileSync(rejectedPath, rejectedLine, 'utf8');
      console.warn(`⚠️ Output rejected: ${validation.reasons.join(', ')}. Recorded in spans-rejected.jsonl`);
      // Still log the span; do not deliver
    } else {
      // Steps 10, 11, & 12: Delivery, DocUpdate artifact, doc-status (TRD §6)
      const strategy = strategyByDoc.get(docPath) || 'suggest';
      console.log(`\ud83d\udce6 Packaging and delivering suggestion (strategy: ${strategy})...`);

      const gitContext = getGitContext();
      const commitContext = {
        commitHash: gitContext.commitHash || process.env.GITHUB_SHA || '',
        prNumber: process.env.PR_NUMBER || '',
        repo: process.env.GITHUB_REPOSITORY || '',
      };
      const provenance = {
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
        inputTokens,
        outputTokens,
      };

      let deliveryResult;
      try {
        deliveryResult = await deliverSuggestion(matchedDocs, generatedMarkdown, docPath, docContent, strategy, {
          docTypeByDoc,
          commitContext,
          provenance,
        });
      } catch (deliveryErr) {
        console.error(`\ud83d\udca5 Delivery Failure: ${deliveryErr.message}`);
        process.exit(4);
      }

      if (deliveryResult.deliveryFailed) {
        process.exit(4);
      }

      // Write ChangeSummary artifact (TRD §3.3)
      const docRef = { type: docTypeByDoc.get(docPath) === 'github-wiki' ? 'repo' : 'repo', path: docPath };
      const docsAffected = [
        { docRef, status: 'updated', updateId: deliveryResult.docUpdateId },
      ];
      const markdownBody = `## Tracer: doc update\n\nUpdated **${docPath}** (strategy: ${strategy}).\n\nCommit: ${commitContext.commitHash ? commitContext.commitHash.slice(0, 7) : 'n/a'}`;
      const summary = artifacts.buildChangeSummary({
        commitHash: commitContext.commitHash,
        commitMessage: gitContext.commitMessage,
        author: gitContext.author,
        timestamp: new Date().toISOString(),
        changedFiles,
        filesAdded: 0,
        filesModified: changedFiles.length,
        filesDeleted: 0,
        docsAffected,
        docsUpdated: 1,
        docsSkipped: matchedDocs.length - 1,
        provenance: { ...provenance, timestamp: new Date().toISOString(), estimatedCost: 0 },
        markdownBody,
        prNumber: commitContext.prNumber || null,
        branch: process.env.GITHUB_REF_NAME || null,
        repo: commitContext.repo || null,
      });
      artifacts.writeChangeSummary(summary);
    }

    // Step 13: Write logs
    console.log("📊 Writing observability span...");
    logSpan({
      id: `span_${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      tool: 'tracer-cli',
      eventType: 'doc_update_generation',
      model: 'claude-sonnet-4-6',
      inputTokens,
      outputTokens,
      latencyMs: Date.now() - startTime,
      promptText: userPrompt // Will be safely stripped by logger.js
    });

    // Step 14: Exit
    console.log("\n✅ Tracer execution complete.");
    process.exit(0);

  } catch (err) {
    if (err.code === 'AI_PROVIDER_FAILURE') {
      if (process.env.GITHUB_TOKEN) {
        try {
          await postPrComment('Tracer: doc update failed, manual review needed.');
        } catch (_) { /* ignore */ }
      }
      console.error(`💥 AI Provider Failure: ${err.message}`);
      process.exit(3);
    }
    console.error(`💥 Runtime Failure: ${err.message}`);
    process.exit(1);
  }
}

runLifecycle();