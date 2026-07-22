import express from 'express'
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
import { apimartAdapter } from './providers/apimart'
import { openaiImagesAdapter } from './providers/openai-images'
import type {
  GenerateSubmitInput,
  GenerationTask,
  ProviderAdapter,
  ProviderConfig,
  ProviderType,
} from './providers/types'

// Load environment variables. Priority (lowest to highest):
// process env < .env < .env.local (in-app config.json stays on top)
dotenv.config({ path: path.join(process.cwd(), '.env'), override: true })
dotenv.config({ path: path.join(process.cwd(), '.env.local'), override: true })

const app = express()
const PORT = Number(process.env.PORT) || 3210

// Root directory for all user data (conversations, images, uploads, config).
// Electron sets DATA_DIR to the app userData folder when packaged.
// In dev / headless B/S mode the default is ./data/ — a single subdirectory
// that keeps user data out of the source tree.
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data')

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

// Provider adapters keyed by provider type
const adapters: Record<ProviderType, ProviderAdapter> = {
  'apimart-task': apimartAdapter,
  'openai-images': openaiImagesAdapter,
}

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
  res.json(getConfig())
})

app.put('/api/config', async (req, res) => {
  try {
    const saved = await saveConfig({ providers: req.body?.providers, aiChat: req.body?.aiChat })
    res.json(saved)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
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
      { prompt: task.prompt, model: task.modelId, size: task.size, resolution: task.resolution },
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
const distDir = path.join(process.cwd(), 'dist')
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
  app.listen(PORT, () => {
    console.log(`GPT Image Chat server: http://localhost:${PORT}`)
    console.log(`Data directory: ${DATA_DIR}`)
    const ready = getConfig().providers.filter(p => p.enabled && p.apiKey).map(p => p.name)
    console.log(`Image providers: ${ready.length ? ready.join(', ') : 'NOT configured (open Settings in the app)'}`)
  })
})()
