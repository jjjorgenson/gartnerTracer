#!/usr/bin/env node
/**
 * Copy .tracer artifacts to dashboard/public/dashboard-data and generate manifest.json.
 * Usage: node dashboard/scripts/prepare-dashboard-data.mjs [source-dir]
 * Default source: .tracer (repo root) or TRACER_SOURCE env.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const sourceDir = process.env.TRACER_SOURCE || process.argv[2] || path.join(repoRoot, '.tracer')
const targetBase = path.join(repoRoot, 'dashboard', 'public', 'dashboard-data')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function copyFile(src, dest) {
  if (fs.existsSync(src)) fs.copyFileSync(src, dest)
}

function listJsonIds(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
}

// Copy doc-status.json
const statusSrc = path.join(sourceDir, 'doc-status.json')
const statusDest = path.join(targetBase, 'doc-status.json')
ensureDir(targetBase)
if (fs.existsSync(statusSrc)) {
  copyFile(statusSrc, statusDest)
  console.log('Copied doc-status.json')
}

// Copy change-summaries
const csSource = path.join(sourceDir, 'change-summaries')
const csTarget = path.join(targetBase, 'change-summaries')
ensureDir(csTarget)
if (fs.existsSync(csSource)) {
  const files = fs.readdirSync(csSource).filter((f) => f.endsWith('.json'))
  for (const f of files) {
    copyFile(path.join(csSource, f), path.join(csTarget, f))
  }
  console.log(`Copied ${files.length} change-summary files`)
}

// Copy doc-updates
const duSource = path.join(sourceDir, 'doc-updates')
const duTarget = path.join(targetBase, 'doc-updates')
ensureDir(duTarget)
if (fs.existsSync(duSource)) {
  const files = fs.readdirSync(duSource).filter((f) => f.endsWith('.json'))
  for (const f of files) {
    copyFile(path.join(duSource, f), path.join(duTarget, f))
  }
  console.log(`Copied ${files.length} doc-update files`)
}

// Write manifest.json
const changeSummaryIds = listJsonIds(csTarget)
const docUpdateIds = listJsonIds(duTarget)
const manifest = { changeSummaryIds, docUpdateIds }
fs.writeFileSync(
  path.join(targetBase, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf8'
)
console.log('Wrote manifest.json')
