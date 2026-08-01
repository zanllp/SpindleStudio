import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import axios from 'axios'
import { promises as fs } from 'fs'
import path from 'path'
import dayjs from 'dayjs'
import dotenv from 'dotenv'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { HttpProxyAgent } from 'http-proxy-agent'
import { getConfig, initConfig, saveConfig } from './lib/config'
import { createTask, getTask, initTasks, updateTask } from './lib/tasks'
import { saveGeneratedImages } from './lib/image-save'
import { extractErrorMessage } from './lib/error'
import { t } from './lib/i18n'
import { adapters, uiHintsForType } from './providers/registry'
import type {
  GenerateSubmitInput,
  GenerationTask,
  ProviderConfig,
} from './providers/types'

// Load environment variables. Priority (lowest to highest):
// process env < .env < .env.local (in-app config.json stays on top)
dotenv.config({ path: path.join(process.cwd(), '.env'), override: true })
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true })

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: true }, // any localhost port (dev 5173 / prod 3210)
  serveClient: false,    // we bundle the client lib ourselves
})
const PORT = Number(process.env.PORT) || 3210
const PORT_RETRY_LIMIT = 10
const PORT_FILE = path.join(process.cwd(), '.server-port')

// socket.io connection logging for debugging cross-window/tab sync
io.on('connection', (socket) => {
  console.log(`[socket.io] client connected: ${socket.id}`)
  socket.on('disconnect', (reason) => {
    console.log(`[socket.io] client disconnected: ${socket.id} (${reason})`)
  })
})

// Root directory for all user data (conversations, images, uploads, config).
// Electron sets DATA_DIR to the app userData folder when packaged.
// In dev / headless B/S mode the default is ./data/ — a single subdirectory
// that keeps user data out of the source tree.
const DATA_DIR = process.env.DATA_DIR
  ? (console.log(`[data] DATA_DIR from env: ${process.env.DATA_DIR}`), process.env.DATA_DIR)
  : (() => {
      const d = path.join(process.cwd(), 'data')
      console.log(`[data] DATA_DIR not set, using cwd fallback: ${d}`)
      console.log(`[data]   cwd = ${process.cwd()}`)
      return d
    })()

// One-time migration: if the parent of DATA_DIR has flat data files (old layout
// from before data/ was consolidated) and DATA_DIR is still empty, move them in.
async function migrateDataDir() {
  try { await fs.access(path.join(DATA_DIR, 'config.json')); return } catch {}
  const parent = path.dirname(DATA_DIR)
  try { await fs.access(path.join(parent, 'config.json')) } catch { return }
  if (parent === DATA_DIR) return // same dir, nothing to migrate

  console.log(`Migrating data files from ${parent} to ${DATA_DIR} …`)
  await fs.mkdir(DATA_DIR, { recursive: true })
  let count = 0
  for (const name of ['config.json', 'tasks.json', 'conversations', 'generated-images', 'uploaded-images']) {
    try {
      await fs.rename(path.join(parent, name), path.join(DATA_DIR, name))
      count++
    } catch { /* not present */ }
  }
  if (count) console.log(`Migration complete — ${count} item(s) moved.`)
}
const SAVE_DIR = path.join(DATA_DIR, 'generated-images')
const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations')
const UPLOADS_DIR = path.join(DATA_DIR, 'uploaded-images')
console.log(`[data] SAVE_DIR: ${SAVE_DIR}`)
console.log(`[data] CONVERSATIONS_DIR: ${CONVERSATIONS_DIR}`)
console.log(`[data] UPLOADS_DIR: ${UPLOADS_DIR}`)

// Proxy support — axios does not read HTTP_PROXY/HTTPS_PROXY automatically
const HTTPS_PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || ''
const HTTP_PROXY = process.env.HTTP_PROXY || process.env.http_proxy || ''
if (HTTP_PROXY) {
  axios.defaults.httpAgent = new HttpProxyAgent(HTTP_PROXY)
  console.log(`HTTP  proxy: ${HTTP_PROXY}`)
}
if (HTTPS_PROXY) {
  axios.defaults.httpsAgent = new HttpsProxyAgent(HTTPS_PROXY)
  console.log(`HTTPS proxy: ${HTTPS_PROXY}`)
}


// Base64 image payloads are large — raise the JSON body limit
app.use(express.json({ limit: '50mb' }))

// ==================== Config endpoints ====================

app.get('/api/config', async (_req, res) => {
  const cfg = getConfig()
  // Merge code-derived UI hints per provider type (never persisted — the
  // sanitize step on save strips unknown fields, and they are re-merged here)
  res.json({
    ...cfg,
    providers: cfg.providers.map(p => ({ ...p, uiHints: uiHintsForType(p.type) })),
  })
})

app.put('/api/config', async (req, res) => {
  try {
    const saved = await saveConfig({ providers: req.body?.providers, aiChat: req.body?.aiChat, promptSnippets: req.body?.promptSnippets })
    io.emit('config-changed')
    res.json(saved)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Import providers from an existing data directory — used by the welcome modal
// when the user points the app at a pre-existing config folder.
app.post('/api/config/import', async (req, res) => {
  try {
    const srcDir = String(req.body?.dataDir || '').trim()
    if (!srcDir) return res.status(400).json({ error: t(req, 'invalidDataDir') })
    const srcFile = path.join(srcDir, 'config.json')
    let src: any
    try {
      const raw = await fs.readFile(srcFile, 'utf-8')
      src = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw)
    } catch {
      return res.status(404).json({ error: t(req, 'noConfigFound', { dir: srcDir }) })
    }
    const srcProviders: any[] = Array.isArray(src.providers) ? src.providers : []
    const imported = srcProviders.filter((p: any) => p.apiKey)
    if (!imported.length) {
      return res.status(404).json({ error: t(req, 'noImportableKeys', { dir: srcDir }) })
    }
    // Merge: overwrite providers with matching ids, append new ones
    const current = getConfig()
    const merged = [...current.providers]
    for (const sp of imported) {
      const idx = merged.findIndex(p => p.id === sp.id)
      const entry = {
        id: String(sp.id || '').slice(0, 64),
        name: String(sp.name || sp.id || '').slice(0, 64),
        type: sp.type || 'openai-images',
        enabled: true,
        apiKey: String(sp.apiKey || '').trim(),
        baseUrl: String(sp.baseUrl || '').trim(),
        models: Array.isArray(sp.models) ? sp.models : [],
      }
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...entry, models: entry.models.length ? entry.models : merged[idx].models }
      } else {
        merged.push(entry)
      }
    }
    const saved = await saveConfig({ providers: merged })
    res.json({ imported: imported.length, ...saved })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Expose data directory paths so the UI can show / open / copy them
app.get('/api/data-dirs', (_req, res) => {
  res.json({
    dataDir: DATA_DIR,
    generatedImagesDir: SAVE_DIR,
    conversationsDir: CONVERSATIONS_DIR,
    uploadsDir: UPLOADS_DIR,
  })
})

// Open a folder in the OS file manager (Windows: Explorer, macOS: Finder, etc.)
app.post('/api/open-folder', (req, res) => {
  const target = String(req.body?.path || '')
  if (!target) return res.status(400).json({ error: 'path required' })
  const { exec } = require('child_process')
  const cmd = process.platform === 'darwin' ? `open "${target}"` : process.platform === 'win32' ? `start "" "${target}"` : `xdg-open "${target}"`
  exec(cmd, (err: any) => {
    if (err) return res.status(500).json({ error: err.message })
    res.json({ success: true })
  })
})

// Refresh model list from provider's image model discovery API.
// Currently only OpenRouter (GET {baseUrl}/images/models) is supported.
app.post('/api/providers/:id/refresh-models', async (req, res) => {
  try {
    const cfg = getConfig()
    const provider = cfg.providers.find(p => p.id === req.params.id)
    if (!provider) return res.status(404).json({ error: t(req, 'providerGone', { id: req.params.id }) })
    if (provider.type !== 'openrouter-images') {
      return res.status(400).json({ error: 'Model refresh is only supported for OpenRouter' })
    }
    if (!provider.apiKey) return res.status(400).json({ error: t(req, 'apiKeyMissing', { provider: provider.name }) })

    const resp = await axios.get(`${provider.baseUrl}/images/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      timeout: 30000,
    })

    const fetched: { id: string; label: string }[] = (resp.data?.data || [])
      .filter((m: any) => m?.id)
      .map((m: any) => ({
        id: m.id,
        // Use the model id as label by default; user can tweak in settings
        label: m.id.split('/').pop() || m.id,
      }))

    if (!fetched.length) {
      return res.status(502).json({ error: 'Empty model list from upstream' })
    }

    // Merge: keep existing models that still appear in the upstream list
    // (preserving their enabled flag and custom label), append new ones disabled.
    // Track removed models so the UI can warn about deprecated entries.
    const existing = new Map(provider.models.map(m => [m.id, m]))
    const fetchedIds = new Set(fetched.map(f => f.id))
    const removed = provider.models.filter(m => !fetchedIds.has(m.id) && m.enabled !== false)

    const merged = fetched.map(f => {
      const old = existing.get(f.id)
      return {
        id: f.id,
        label: old?.label || f.label,
        // Keep user's toggle state for existing models; new models default off
        ...(old?.enabled === false ? { enabled: false } : {}),
        ...(!old ? { enabled: false } : {}),
      }
    })

    const updated = cfg.providers.map(p =>
      p.id === provider.id ? { ...p, models: merged } : p,
    )
    const saved = await saveConfig({ providers: updated })
    console.log(`[openrouter] refreshed models: ${fetched.length} fetched (${merged.length} merged)${removed.length ? `, ${removed.length} removed` : ''}`)
    res.json({ ...saved, removed: removed.map(m => m.id) })
  } catch (error: any) {
    console.error('refresh-models failed:', error.response?.data || error.message)
    res.status(error.response?.status || 502).json({
      error: error.response?.data?.error || error.message || 'Failed to fetch models',
    })
  }
})

// ==================== Image generation (multi-provider, unified task model) ====================
//
// The frontend always uses the same submit -> poll flow. Async providers (API Mart)
// return a real upstream task id at submit; synchronous providers (OpenAI-compatible)
// get a local task id and the upstream request fires on the first poll.

// Reference images (large base64 payloads) are kept in memory between submit and
// first poll instead of being written to tasks.json
const pendingInputs = new Map<string, GenerateSubmitInput>()

// Submit a generation task
app.post('/api/generate/submit', async (req, res) => {
  try {
    const input: GenerateSubmitInput = {
      providerId: String(req.body?.providerId || ''),
      modelId: String(req.body?.modelId || ''),
      prompt: String(req.body?.prompt || ''),
      n: Number(req.body?.n) || 1,
      size: String(req.body?.size || 'auto'),
      resolution: String(req.body?.resolution || '1k'),
      imageCategory: req.body?.imageCategory,
      image_urls: Array.isArray(req.body?.image_urls) ? req.body.image_urls : undefined,
      referenceImagePaths: Array.isArray(req.body?.referenceImagePaths) ? req.body.referenceImagePaths : undefined,
    }
    const provider = getConfig().providers.find(p => p.id === input.providerId)
    if (!provider) return res.status(400).json({ error: t(req, 'unknownProvider') })
    if (!provider.apiKey) return res.status(400).json({ error: t(req, 'apiKeyMissing', { provider: provider.name }) })
    if (!input.prompt.trim()) return res.status(400).json({ error: t(req, 'promptRequired') })

    const model = provider.models.find(m => m.id === input.modelId) || { id: input.modelId, label: input.modelId }
    const adapter = adapters[provider.type]
    const { taskId } = await adapter.submit(input, provider, model)
    console.log(`task submitted [${provider.id}/${model.id}]: ${taskId}`)

    const now = Date.now()
    const task: GenerationTask = {
      taskId,
      providerId: provider.id,
      modelId: model.id,
      status: 'pending',
      prompt: input.prompt,
      size: input.size,
      resolution: input.resolution,
      imageCategory: input.imageCategory,
      extra: model.extra,
      referenceImagePaths: input.referenceImagePaths,
      createdAt: now,
      updatedAt: now,
    }
    await createTask(task)
    if (input.image_urls?.length) pendingInputs.set(taskId, input)

    res.json({ task_id: taskId, status: 'pending' })
  } catch (error: any) {
    console.error('generate submit failed:', error.response?.data || extractErrorMessage(error))
    res.status(error.response?.status || 500).json({
      error: extractErrorMessage(error),
    })
  }
})

// Poll a generation task
app.get('/api/generate/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params
    let task = getTask(taskId)
    let provider: ProviderConfig | undefined
    let isLegacy = false

    if (task) {
      provider = getConfig().providers.find(p => p.id === task!.providerId)
      if (!provider) return res.status(400).json({ error: t(req, 'providerGone', { id: task!.providerId }) })
    } else {
      // Task not in the registry: created before tasks.json existed (or by an older
      // build). Those were all API Mart tasks — fall back with default metadata.
      isLegacy = true
      provider = getConfig().providers.find(p => p.id === 'apimart')
      if (!provider?.apiKey) {
        return res.status(400).json({ error: t(req, 'legacyKeyMissing') })
      }
      task = {
        taskId,
        providerId: 'apimart',
        modelId: 'gpt-image-2',
        status: 'pending',
        prompt: '',
        size: '',
        resolution: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    }

    // Completed tasks return the cached payload; failed tasks replay the error
    if (task.payload) return res.json(task.payload)
    if (task.status === 'failed') {
      return res.json({ task_id: taskId, status: 'failed', error: task.error })
    }

    const adapter = adapters[provider.type]
    const outcome = await adapter.poll(task, provider, pendingInputs.get(taskId))

    if (outcome.status === 'pending') {
      return res.json({ task_id: taskId, status: 'pending' })
    }
    if (outcome.status === 'failed') {
      pendingInputs.delete(taskId)
      console.error(`generate task failed [${taskId}]:`, outcome.error)
      if (!isLegacy) await updateTask(taskId, { status: 'failed', error: outcome.error })
      return res.json({ task_id: taskId, status: 'failed', error: outcome.error })
    }

    // Completed — download/decode, embed EXIF, persist to disk, cache the payload
    const { results, metadata } = await saveGeneratedImages(
      SAVE_DIR,
      outcome.sources || [],
      {
        prompt: task.prompt,
        model: task.modelId,
        size: task.size,
        resolution: task.resolution,
        providerId: task.providerId,
        createdAt: task.createdAt,
        referenceImagePaths: task.referenceImagePaths,
      },
      task.imageCategory || '',
      taskId,
    )
    if (!results.length) {
      return res.status(502).json({ error: 'No image in response' })
    }
    const first = results[0]
    const payload = {
      task_id: taskId,
      status: 'completed',
      saved_path: first.saved_path,
      filename: first.filename,
      imageCategory: task.imageCategory || '',
      metadata,
      url: first.url,
      results: results.map(r => ({ url: r.url, filename: r.filename })),
    }
    if (isLegacy) {
      // Register the legacy task so repeated polls hit the cache instead of re-saving
      await createTask({ ...task, status: 'completed', payload, updatedAt: Date.now() })
    } else {
      await updateTask(taskId, { status: 'completed', payload })
    }
    pendingInputs.delete(taskId)
    res.json(payload)
  } catch (error: any) {
    console.error(`generate poll failed [${req.params.taskId}]:`, error.response?.data || extractErrorMessage(error))
    res.status(error.response?.status || 500).json({
      error: extractErrorMessage(error),
    })
  }
})

// ==================== AI chat (optional, used for the "AI title" feature) ====================

app.post('/api/ai-chat', async (req, res) => {
  try {
    const aiChat = getConfig().aiChat
    if (!aiChat.apiKey) {
      return res.status(500).json({ error: t(req, 'aiChatNotConfigured') })
    }

    const response = await axios.post(
      `${aiChat.baseUrl}/chat/completions`,
      req.body,
      {
        headers: {
          'Authorization': `Bearer ${aiChat.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    )
    res.json(response.data)
  } catch (error: any) {
    console.error('AI chat failed:', error.response?.data || error.message)
    res.status(error.response?.status || 500).json({
      error: extractErrorMessage(error)
    })
  }
})

// ==================== Conversation persistence ====================

// Validate conversation IDs to prevent path traversal
function sanitizeConversationId(id: string): string | null {
  if (/^[\w-]{1,64}$/.test(id)) return id
  return null
}

function conversationFilePath(id: string): string | null {
  const safe = sanitizeConversationId(id)
  return safe ? path.join(CONVERSATIONS_DIR, `${safe}.json`) : null
}

// List conversations (newest first)
app.get('/api/conversations', async (_req, res) => {
  try {
    const files = await fs.readdir(CONVERSATIONS_DIR)
    const conversations: Array<{ id: string; title: string; createdAt: number; updatedAt: number }> = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(path.join(CONVERSATIONS_DIR, file), 'utf-8')
        const data = JSON.parse(raw)
        conversations.push({
          id: data.id,
          title: data.title,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        })
      } catch {
        // Skip corrupted conversation files
      }
    }
    conversations.sort((a, b) => b.updatedAt - a.updatedAt)
    res.json({ conversations })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Create a conversation
app.post('/api/conversations', async (req, res) => {
  try {
    const id = `conv_${dayjs().format('YYYYMMDD_HHmmss')}_${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    const conversation = {
      id,
      title: req.body.title || t(req, 'newConversationTitle'),
      createdAt: now,
      updatedAt: now,
      messages: [],
    }
    await fs.writeFile(path.join(CONVERSATIONS_DIR, `${id}.json`), JSON.stringify(conversation, null, 2))
    io.emit('conversations-changed')
    console.log(`[socket.io] emit conversations-changed (created: ${id})`)
    res.json(conversation)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Read one conversation
app.get('/api/conversations/:id', async (req, res) => {
  try {
    const filepath = conversationFilePath(req.params.id)
    if (!filepath) return res.status(400).json({ error: t(req, 'invalidConversationId') })
    const raw = await fs.readFile(filepath, 'utf-8')
    res.json(JSON.parse(raw))
  } catch (error: any) {
    if (error.code === 'ENOENT') return res.status(404).json({ error: t(req, 'conversationNotFound') })
    res.status(500).json({ error: error.message })
  }
})

// Save a conversation (whole-document write)
app.put('/api/conversations/:id', async (req, res) => {
  try {
    const filepath = conversationFilePath(req.params.id)
    if (!filepath) return res.status(400).json({ error: t(req, 'invalidConversationId') })
    const data = req.body
    if (!data || data.id !== req.params.id) {
      return res.status(400).json({ error: t(req, 'conversationMismatch') })
    }
    await fs.writeFile(filepath, JSON.stringify(data, null, 2))
    io.emit('conversation-updated', { convId: req.params.id })
    console.log(`[socket.io] emit conversation-updated: ${req.params.id}`)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ==================== Upload history & usage stats ====================

const UPLOAD_STATS_FILE = path.join(UPLOADS_DIR, 'stats.json')

async function readUploadStats(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await fs.readFile(UPLOAD_STATS_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

async function writeUploadStats(stats: Record<string, number>): Promise<void> {
  await fs.writeFile(UPLOAD_STATS_FILE, JSON.stringify(stats))
}

// Delete a conversation (and its upload directory)
app.delete('/api/conversations/:id', async (req, res) => {
  try {
    const filepath = conversationFilePath(req.params.id)
    if (!filepath) return res.status(400).json({ error: t(req, 'invalidConversationId') })
    await fs.rm(filepath, { force: true })
    await fs.rm(path.join(UPLOADS_DIR, req.params.id), { recursive: true, force: true })
    const stats = await readUploadStats()
    let mutated = false
    for (const key of Object.keys(stats)) {
      if (key.startsWith(`${req.params.id}/`)) {
        delete stats[key]
        mutated = true
      }
    }
    if (mutated) await writeUploadStats(stats)
    io.emit('conversations-changed')
    console.log(`[socket.io] emit conversations-changed (deleted: ${req.params.id})`)
    res.json({ success: true })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Upload a reference image (base64 data URL) into uploaded-images/<convId>/
app.post('/api/conversations/:id/upload', async (req, res) => {
  try {
    const safeId = sanitizeConversationId(req.params.id)
    if (!safeId) return res.status(400).json({ error: t(req, 'invalidConversationId') })

    const { filename, base64 } = req.body
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ error: t(req, 'base64Required') })
    }

    const match = base64.match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/)
    if (!match) return res.status(400).json({ error: t(req, 'unsupportedImageType') })

    const extMap: Record<string, string> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp', gif: 'gif' }
    const ext = extMap[match[1]] || 'png'
    const imageBuffer = Buffer.from(match[2], 'base64')

    const uploadDir = path.join(UPLOADS_DIR, safeId)
    await fs.mkdir(uploadDir, { recursive: true })

    const baseName = (filename || 'image').replace(/\.[^.]+$/, '').replace(/[^\w一-龥-]/g, '_').slice(0, 40)
    const savedFilename = `${dayjs().format('YYYYMMDD_HHmmss')}_${baseName}.${ext}`
    await fs.writeFile(path.join(uploadDir, savedFilename), imageBuffer)

    const relativePath = `${safeId}/${savedFilename}`
    console.log(`reference image saved: uploads/${relativePath}`)
    res.json({
      success: true,
      filename: savedFilename,
      relativePath,
      url: `/uploads/${relativePath}`,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Uploaded reference images across all conversations (by usage frequency, then recency)
app.get('/api/uploads', async (_req, res) => {
  try {
    const stats = await readUploadStats()
    const items: Array<{ url: string; relativePath: string; filename: string; useCount: number; uploadedAt: number }> = []
    const convDirs = await fs.readdir(UPLOADS_DIR, { withFileTypes: true })
    for (const convDir of convDirs) {
      if (!convDir.isDirectory()) continue
      const dirPath = path.join(UPLOADS_DIR, convDir.name)
      for (const f of await fs.readdir(dirPath)) {
        if (!/\.(png|jpe?g|webp|gif)$/i.test(f)) continue
        const rel = `${convDir.name}/${f}`
        const stat = await fs.stat(path.join(dirPath, f))
        items.push({
          url: `/uploads/${rel}`,
          relativePath: rel,
          filename: f,
          useCount: stats[rel] || 0,
          uploadedAt: stat.mtimeMs,
        })
      }
    }
    items.sort((a, b) => b.useCount - a.useCount || b.uploadedAt - a.uploadedAt)
    res.json({ uploads: items })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// Record that an uploaded image was used as a reference
app.post('/api/uploads/usage', async (req, res) => {
  try {
    const rel = String(req.body.relativePath || '')
    if (!/^[\w-]+\/[\w.一-龥-]+$/.test(rel)) return res.status(400).json({ error: t(req, 'invalidPath') })
    const stats = await readUploadStats()
    stats[rel] = (stats[rel] || 0) + 1
    await writeUploadStats(stats)
    res.json({ success: true, useCount: stats[rel] })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// ==================== Static files ====================

app.use('/images', express.static(SAVE_DIR))
app.use('/uploads', express.static(UPLOADS_DIR))

// Frontend build output
// __dirname works for both dev (server/) and production (dist-server/) —
// dist/ is always one level up from this file's directory.
const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))

// SPA fallback — every non-API route returns index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/images/') || req.path.startsWith('/uploads/')) {
    return next()
  }
  const indexPath = path.join(distDir, 'index.html')
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send('Frontend not found — run "npm run build" first')
    }
  })
})

;(async () => {
  await migrateDataDir()
  await fs.mkdir(SAVE_DIR, { recursive: true })
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true })
  await fs.mkdir(UPLOADS_DIR, { recursive: true })
  await Promise.all([initConfig(DATA_DIR), initTasks(DATA_DIR)])

  // Port auto-retry: if the default port is occupied, try the next N ports.
  // The chosen port is written to .server-port so the Vite dev server and Electron
  // can pick it up without hardcoding.
  let actualPort = PORT
  for (let attempt = 0; attempt < PORT_RETRY_LIMIT; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        httpServer.once('error', reject)
        httpServer.listen(actualPort, () => {
          httpServer.removeAllListeners('error')
          resolve()
        })
      })
      break // success
    } catch (err: any) {
      if (err.code === 'EADDRINUSE' && attempt < PORT_RETRY_LIMIT - 1) {
        console.warn(`Port ${actualPort} is in use, trying ${actualPort + 1}...`)
        actualPort++
      } else {
        throw err
      }
    }
  }

  // Persist the actual port so Vite (wait-on / vite.config.ts) can discover it.
  // Skipped under Electron: the cwd may be read-only there (/ on macOS when
  // launched from Finder) and the port is handed over in-process instead.
  if (!process.versions.electron) {
    await fs.writeFile(PORT_FILE, String(actualPort))
  }
  process.env.PORT = String(actualPort) // so tsx watch restarts reuse the same port
  // In-process handoff for the Electron main process (auto-retry may have moved
  // us off the default port — the window must load the ACTUAL one)
  process.env.SPINDLESTUDIO_ACTUAL_PORT = String(actualPort)

  console.log(`SpindleStudio server: http://localhost:${actualPort}`)
  console.log(`Data directory: ${DATA_DIR}`)
  const ready = getConfig().providers.filter(p => p.enabled && p.apiKey).map(p => p.name)
  console.log(`Image providers: ${ready.length ? ready.join(', ') : 'NOT configured (open Settings in the app)'}`)
})()
