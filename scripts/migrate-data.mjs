#!/usr/bin/env node
// Incremental data migration from another gpt-image-chat installation
// (e.g. the source repo this project was extracted from).
//
// Copies only what the destination is missing or has stale copies of:
//   - conversations/*.json      copied when missing, or when the source file is newer
//   - generated-images/chat/*   copied when missing
//   - uploaded-images/**        copied when missing; stats.json merged (max useCount)
//
// Idempotent — safe to re-run any number of times.
//
// Usage:
//   node scripts/migrate-data.mjs <sourceDir> [destDir]
//   node scripts/migrate-data.mjs ../Z-Image-Turbo/client
//
// destDir defaults to the repo root (development data dir).

import { promises as fs } from 'fs'
import path from 'path'

const [, , srcArg, destArg] = process.argv
if (!srcArg) {
  console.error('usage: node scripts/migrate-data.mjs <sourceDir> [destDir]')
  process.exit(1)
}
const SRC = path.resolve(srcArg)
const DEST = path.resolve(destArg || path.join(process.cwd()))

const stats = { convCopied: 0, convUpdated: 0, convSkipped: 0, imagesCopied: 0, uploadsCopied: 0, statsMerged: 0 }

async function exists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.copyFile(src, dest)
}

async function migrateConversations() {
  const srcDir = path.join(SRC, 'conversations')
  const destDir = path.join(DEST, 'conversations')
  if (!(await exists(srcDir))) return
  for (const file of await fs.readdir(srcDir)) {
    if (!file.endsWith('.json')) continue
    const srcFile = path.join(srcDir, file)
    const destFile = path.join(destDir, file)
    if (!(await exists(destFile))) {
      await copyFile(srcFile, destFile)
      stats.convCopied++
      console.log(`+ conversation: ${file}`)
      continue
    }
    // Exists in both — overwrite only when the source copy is strictly newer
    const [s, d] = await Promise.all([fs.stat(srcFile), fs.stat(destFile)])
    if (s.mtimeMs > d.mtimeMs) {
      await copyFile(srcFile, destFile)
      stats.convUpdated++
      console.log(`~ conversation (newer in source): ${file}`)
    } else {
      stats.convSkipped++
    }
  }
}

async function migrateImages() {
  const srcDir = path.join(SRC, 'generated-images', 'chat')
  const destDir = path.join(DEST, 'generated-images', 'chat')
  if (!(await exists(srcDir))) return
  for (const file of await fs.readdir(srcDir)) {
    const srcFile = path.join(srcDir, file)
    const destFile = path.join(destDir, file)
    if ((await fs.stat(srcFile)).isDirectory()) continue
    if (!(await exists(destFile))) {
      await copyFile(srcFile, destFile)
      stats.imagesCopied++
    }
  }
  if (stats.imagesCopied) console.log(`+ chat images: ${stats.imagesCopied} files`)
}

async function migrateUploads() {
  const srcDir = path.join(SRC, 'uploaded-images')
  const destDir = path.join(DEST, 'uploaded-images')
  if (!(await exists(srcDir))) return
  for (const convDir of await fs.readdir(srcDir)) {
    const srcConv = path.join(srcDir, convDir)
    if (!(await fs.stat(srcConv)).isDirectory()) continue
    for (const file of await fs.readdir(srcConv)) {
      const srcFile = path.join(srcConv, file)
      const destFile = path.join(destDir, convDir, file)
      if (!(await exists(destFile))) {
        await copyFile(srcFile, destFile)
        stats.uploadsCopied++
        console.log(`+ upload: ${convDir}/${file}`)
      }
    }
  }

  // Merge usage stats: keep the higher useCount for each key
  const srcStatsFile = path.join(srcDir, 'stats.json')
  if (await exists(srcStatsFile)) {
    const srcStats = JSON.parse(await fs.readFile(srcStatsFile, 'utf-8'))
    let destStats = {}
    const destStatsFile = path.join(destDir, 'stats.json')
    if (await exists(destStatsFile)) {
      destStats = JSON.parse(await fs.readFile(destStatsFile, 'utf-8'))
    }
    let changed = false
    for (const [key, count] of Object.entries(srcStats)) {
      if ((destStats[key] || 0) < count) {
        destStats[key] = count
        changed = true
        stats.statsMerged++
      }
    }
    if (changed) {
      await fs.mkdir(destDir, { recursive: true })
      await fs.writeFile(destStatsFile, JSON.stringify(destStats))
      console.log(`~ upload stats merged: ${stats.statsMerged} keys updated`)
    }
  }
}

console.log(`source: ${SRC}`)
console.log(`dest:   ${DEST}`)
await migrateConversations()
await migrateImages()
await migrateUploads()
console.log(
  `done. conversations: +${stats.convCopied} new, ~${stats.convUpdated} updated, ${stats.convSkipped} unchanged; ` +
    `images: +${stats.imagesCopied}; uploads: +${stats.uploadsCopied}`,
)
