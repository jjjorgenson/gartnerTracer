#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

function printUsage() {
  console.error(
    'Usage: node scripts/post-tracer-ingest.mjs --repo owner/repo [--source path/to/.tracer] [--out payload.json] [--url http://localhost:3002]'
  )
}

function parseArgs(argv) {
  const args = {
    source: '.tracer',
    repo: '',
    out: '',
    url: '',
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = argv[i + 1]

    if (arg === '--source' && next) {
      args.source = next
      i += 1
    } else if (arg === '--repo' && next) {
      args.repo = next
      i += 1
    } else if (arg === '--out' && next) {
      args.out = next
      i += 1
    } else if (arg === '--url' && next) {
      args.url = next
      i += 1
    } else if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`)
    }
  }

  return args
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function listJsonIds(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return []
  }

  return fs.readdirSync(dirPath)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => file.replace(/\.json$/, ''))
}

function readJsonCollection(dirPath, ids) {
  return ids.map((id) => readJson(path.join(dirPath, `${id}.json`)))
}

function buildPayload(sourceDir, repo) {
  const absoluteSourceDir = path.resolve(sourceDir)
  if (!fs.existsSync(absoluteSourceDir)) {
    throw new Error(`Source directory not found: ${absoluteSourceDir}`)
  }

  const docStatusPath = path.join(absoluteSourceDir, 'doc-status.json')
  const manifestPath = path.join(absoluteSourceDir, 'manifest.json')
  const changeSummariesDir = path.join(absoluteSourceDir, 'change-summaries')
  const docUpdatesDir = path.join(absoluteSourceDir, 'doc-updates')

  const changeSummaryIds = listJsonIds(changeSummariesDir)
  const docUpdateIds = listJsonIds(docUpdatesDir)

  const manifest = fs.existsSync(manifestPath)
    ? readJson(manifestPath)
    : {
        changeSummaryIds,
        docUpdateIds,
      }

  return {
    repo,
    docStatus: fs.existsSync(docStatusPath) ? readJson(docStatusPath) : undefined,
    changeSummaries: readJsonCollection(changeSummariesDir, manifest.changeSummaryIds || changeSummaryIds),
    docUpdates: readJsonCollection(docUpdatesDir, manifest.docUpdateIds || docUpdateIds),
    manifest: {
      changeSummaryIds: manifest.changeSummaryIds || changeSummaryIds,
      docUpdateIds: manifest.docUpdateIds || docUpdateIds,
    },
  }
}

function normalizeIngestUrl(url) {
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!trimmed) {
    return ''
  }

  if (trimmed.endsWith('/webhook/ingest')) {
    return trimmed
  }

  return `${trimmed}/webhook/ingest`
}

async function postPayload(url, payload) {
  const headers = {
    'content-type': 'application/json',
  }

  if (process.env.AUTODOCS_WEBHOOK_SECRET) {
    headers['x-autodocs-webhook-secret'] = process.env.AUTODOCS_WEBHOOK_SECRET
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${response.status} ${response.statusText}${text ? `\n${text}` : ''}`)
  }

  return text
}

async function main() {
  const { source, repo, out, url } = parseArgs(process.argv.slice(2))

  if (!repo) {
    printUsage()
    throw new Error('--repo is required')
  }

  const payload = buildPayload(source, repo)
  const json = JSON.stringify(payload, null, 2)

  if (out) {
    const outputPath = path.resolve(out)
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    fs.writeFileSync(outputPath, json, 'utf8')
    console.log(`Wrote ingest payload to ${outputPath}`)
  } else if (!url) {
    process.stdout.write(json + '\n')
  }

  if (url) {
    const ingestUrl = normalizeIngestUrl(url)
    const responseText = await postPayload(ingestUrl, payload)
    console.log(`Posted ingest payload to ${ingestUrl}`)
    if (responseText) {
      console.log(responseText)
    }
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
