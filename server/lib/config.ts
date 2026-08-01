import { promises as fs } from 'fs'
import path from 'path'
import { FALLBACK_PROVIDER_TYPE, isKnownProviderType } from '../providers/registry'
import type { ProviderConfig, ProviderModel } from '../providers/types'

// App configuration managed by the settings page. Persisted to config.json.
// Priority: config.json (in-app settings) > environment variables > defaults below.
export interface AiChatConfig {
  apiKey: string
  baseUrl: string
  model: string
}

// Saved prompt shortcut — filled into the chat input from the toolbar panel
export interface PromptSnippet {
  id: string
  title: string
  prompt: string
}

export interface AppConfig {
  providers: ProviderConfig[]
  aiChat: AiChatConfig
  promptSnippets: PromptSnippet[]
}

export const DEFAULT_APIMART_BASE_URL = 'https://api.apimart.ai/v1'
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

// OpenRouter image model presets — snapshot of the free discovery API
// (GET /api/v1/images/models, 2026-07). A curated few ship enabled; the rest
// are opt-in via the Settings toggle. The adapter validates capabilities
// against the live discovery API at generation time, so a stale entry fails
// with a clear upstream error rather than a bad request.
export const OPENROUTER_MODEL_PRESETS: ProviderModel[] = [
  // Curated defaults
  { id: 'openai/gpt-image-2', label: 'gpt-image-2' },
  { id: 'openai/gpt-image-1', label: 'gpt-image-1' },
  { id: 'google/gemini-3.1-flash-image', label: 'gemini-3.1-flash-image' },
  { id: 'google/gemini-2.5-flash-image', label: 'gemini-2.5-flash-image' },
  // Opt-in
  { id: 'openai/gpt-image-1-mini', label: 'gpt-image-1-mini', enabled: false },
  { id: 'openai/gpt-5.4-image-2', label: 'gpt-5.4-image-2', enabled: false },
  { id: 'openai/gpt-5-image', label: 'gpt-5-image', enabled: false },
  { id: 'openai/gpt-5-image-mini', label: 'gpt-5-image-mini', enabled: false },
  { id: 'google/gemini-3.1-flash-image-preview', label: 'gemini-3.1-flash-image-preview', enabled: false },
  { id: 'google/gemini-3.1-flash-lite-image', label: 'gemini-3.1-flash-lite-image', enabled: false },
  { id: 'google/gemini-3-pro-image', label: 'gemini-3-pro-image', enabled: false },
  { id: 'google/gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview', enabled: false },
  { id: 'bytedance-seed/seedream-4.5', label: 'seedream-4.5', enabled: false },
  { id: 'black-forest-labs/flux.2-pro', label: 'flux.2-pro', enabled: false },
  { id: 'black-forest-labs/flux.2-max', label: 'flux.2-max', enabled: false },
  { id: 'black-forest-labs/flux.2-flex', label: 'flux.2-flex', enabled: false },
  { id: 'black-forest-labs/flux.2-klein-4b', label: 'flux.2-klein-4b', enabled: false },
  { id: 'microsoft/mai-image-2.5-pro', label: 'mai-image-2.5-pro', enabled: false },
  { id: 'microsoft/mai-image-2.5', label: 'mai-image-2.5', enabled: false },
  { id: 'x-ai/grok-imagine-image-quality', label: 'grok-imagine-image-quality', enabled: false },
  { id: 'krea/krea-2-large', label: 'krea-2-large', enabled: false },
  { id: 'krea/krea-2-medium', label: 'krea-2-medium', enabled: false },
  { id: 'krea/krea-2-medium-turbo', label: 'krea-2-medium-turbo', enabled: false },
  { id: 'sourceful/riverflow-v2.5-pro', label: 'riverflow-v2.5-pro', enabled: false },
  { id: 'sourceful/riverflow-v2.5-fast', label: 'riverflow-v2.5-fast', enabled: false },
  { id: 'sourceful/riverflow-v2-pro', label: 'riverflow-v2-pro', enabled: false },
  { id: 'sourceful/riverflow-v2-fast', label: 'riverflow-v2-fast', enabled: false },
  { id: 'recraft/recraft-v4.1-pro', label: 'recraft-v4.1-pro', enabled: false },
  { id: 'recraft/recraft-v4.1', label: 'recraft-v4.1', enabled: false },
  { id: 'recraft/recraft-v4.1-pro-vector', label: 'recraft-v4.1-pro-vector', enabled: false },
  { id: 'recraft/recraft-v4.1-vector', label: 'recraft-v4.1-vector', enabled: false },
  { id: 'recraft/recraft-v4.1-utility-pro', label: 'recraft-v4.1-utility-pro', enabled: false },
  { id: 'recraft/recraft-v4.1-utility', label: 'recraft-v4.1-utility', enabled: false },
  { id: 'recraft/recraft-v4-pro', label: 'recraft-v4-pro', enabled: false },
  { id: 'recraft/recraft-v4', label: 'recraft-v4', enabled: false },
  { id: 'recraft/recraft-v4-pro-vector', label: 'recraft-v4-pro-vector', enabled: false },
  { id: 'recraft/recraft-v4-vector', label: 'recraft-v4-vector', enabled: false },
  { id: 'recraft/recraft-v3', label: 'recraft-v3', enabled: false },
]

let configFile = ''
let appConfig: AppConfig = { providers: [], aiChat: { apiKey: '', baseUrl: DEFAULT_OPENAI_BASE_URL, model: 'gpt-4o-mini' }, promptSnippets: [] }

export function getConfig(): AppConfig {
  return appConfig
}

function defaultProviders(): ProviderConfig[] {
  return [
    {
      id: 'apimart',
      name: 'API Mart',
      type: 'apimart-task',
      enabled: true,
      apiKey: process.env.APIMART_API_KEY || '',
      baseUrl: process.env.APIMART_BASE_URL || DEFAULT_APIMART_BASE_URL,
      models: [
        { id: 'gpt-image-2', label: 'gpt-image-2' },
        { id: 'gpt-image-2-official', label: 'gpt-image-2 · Official', extra: { official_fallback: true } },
      ],
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      type: 'openrouter-images',
      enabled: true,
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL,
      models: OPENROUTER_MODEL_PRESETS.map(m => ({ ...m })),
    },
    {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai-images',
      enabled: false,
      apiKey: '',
      baseUrl: DEFAULT_OPENAI_BASE_URL,
      models: [{ id: 'gpt-image-1', label: 'gpt-image-1' }],
    },
  ]
}

export async function initConfig(dataDir: string): Promise<AppConfig> {
  configFile = path.join(dataDir, 'config.json')
  console.log(`[config] configFile: ${configFile}`)
  appConfig = {
    providers: defaultProviders(),
    aiChat: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
      model: 'gpt-4o-mini',
    },
    promptSnippets: [],
  }

  let saved: any = null
  try {
    // Strip a possible BOM — some editors write UTF-8 with one and JSON.parse rejects it
    const raw = await fs.readFile(configFile, 'utf-8')
    saved = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw)
    console.log(`[config] loaded existing config.json — ${saved.providers?.length || 0} providers`)
  } catch {
    console.log('[config] no config.json yet, using defaults')
  }

  if (saved) {
    if (Array.isArray(saved.providers)) {
      // Current schema
      appConfig.providers = saved.providers
      // The built-in OpenRouter provider moved from the OpenAI-compatible
      // adapter to OpenRouter's dedicated Image API (POST /images) — re-point
      // saved configs, which would otherwise keep hitting the old endpoint
      let migrated = false
      for (const p of appConfig.providers) {
        if (p?.id !== 'openrouter') continue
        if (p.type !== 'openrouter-images') {
          p.type = 'openrouter-images'
          migrated = true
        }
        // Ship the full image-model preset list to existing installs: any
        // preset the user doesn't have yet is appended disabled (opt-in).
        // Once any model carries an explicit enabled flag the list is
        // considered user-managed and is never merged again — this keeps
        // later deletions from being resurrected on the next start.
        const models: ProviderModel[] = Array.isArray(p.models) ? p.models : []
        if (!models.some(m => m.enabled !== undefined)) {
          const known = new Set(models.map(m => m.id))
          const missing = OPENROUTER_MODEL_PRESETS.filter(m => !known.has(m.id))
          if (missing.length) {
            p.models = [...models, ...missing.map(m => ({ ...m }))]
            migrated = true
            console.log(`config.json migrated: ${missing.length} OpenRouter model presets appended (disabled)`)
          }
        }
      }
      if (saved.aiChat) {
        appConfig.aiChat = { ...appConfig.aiChat, ...saved.aiChat }
      }
      // Older configs have no promptSnippets — keep the empty default.
      // Empty-prompt items are kept: a freshly created snippet is blank until edited
      if (Array.isArray(saved.promptSnippets)) {
        appConfig.promptSnippets = (saved.promptSnippets as any[]).map(sanitizeSnippet).filter((s: PromptSnippet) => s.id)
      }
      if (migrated) {
        await persistConfig()
        console.log('config.json migrated: openrouter provider now uses the OpenRouter Image API')
      }
    } else {
      // Legacy flat schema (apimartApiKey/apimartBaseUrl/openaiApiKey/openaiBaseUrl)
      // — migrate into the providers[] + aiChat structure and write back
      const apimart = appConfig.providers.find(p => p.id === 'apimart')!
      if (saved.apimartApiKey) apimart.apiKey = String(saved.apimartApiKey)
      if (saved.apimartBaseUrl) apimart.baseUrl = String(saved.apimartBaseUrl)
      if (saved.openaiApiKey) appConfig.aiChat.apiKey = String(saved.openaiApiKey)
      if (saved.openaiBaseUrl) appConfig.aiChat.baseUrl = String(saved.openaiBaseUrl)
      await persistConfig()
      console.log('config.json migrated to the providers schema')
    }
  }
  return appConfig
}

async function persistConfig(): Promise<void> {
  await fs.mkdir(path.dirname(configFile), { recursive: true })
  await fs.writeFile(configFile, JSON.stringify(appConfig, null, 2))
  console.log(`[config] saved to ${configFile}`)
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  if (Array.isArray(patch.providers)) {
    appConfig.providers = patch.providers.map(sanitizeProvider).filter(p => p.id)
  }
  if (patch.aiChat) {
    appConfig.aiChat = {
      apiKey: typeof patch.aiChat.apiKey === 'string' ? patch.aiChat.apiKey.trim() : appConfig.aiChat.apiKey,
      baseUrl: normalizeBaseUrl(patch.aiChat.baseUrl, DEFAULT_OPENAI_BASE_URL),
      model: typeof patch.aiChat.model === 'string' ? patch.aiChat.model.trim() || 'gpt-4o-mini' : appConfig.aiChat.model,
    }
  }
  if (Array.isArray(patch.promptSnippets)) {
    appConfig.promptSnippets = patch.promptSnippets.map(sanitizeSnippet).filter(s => s.id)
  }
  await persistConfig()
  return appConfig
}

function sanitizeSnippet(s: any): PromptSnippet {
  return {
    id: String(s?.id || '').slice(0, 64),
    title: String(s?.title || '').trim().slice(0, 64),
    prompt: typeof s?.prompt === 'string' ? s.prompt.slice(0, 4000) : '',
  }
}

function normalizeBaseUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/\/+$/, '') || fallback
}

function sanitizeProvider(p: any): ProviderConfig {
  // Whitelist derives from the adapter registry — a type registered there can
  // never be silently coerced here
  const type: ProviderConfig['type'] = isKnownProviderType(p?.type) ? p.type : FALLBACK_PROVIDER_TYPE
  const fallbackBaseUrl = type === 'apimart-task' ? DEFAULT_APIMART_BASE_URL : DEFAULT_OPENAI_BASE_URL
  return {
    id: String(p?.id || '').slice(0, 64),
    name: String(p?.name || p?.id || '').slice(0, 64),
    type,
    enabled: !!p?.enabled,
    apiKey: typeof p?.apiKey === 'string' ? p.apiKey.trim() : '',
    baseUrl: normalizeBaseUrl(p?.baseUrl, fallbackBaseUrl),
    custom: !!p?.custom,
    models: Array.isArray(p?.models)
      ? p.models
          .map((m: any) => ({
            id: String(m?.id || '').trim(),
            label: String(m?.label || m?.id || '').trim(),
            // Absent means enabled; only an explicit false is persisted
            ...(m?.enabled === false ? { enabled: false } : {}),
            ...(m?.extra && typeof m.extra === 'object' ? { extra: m.extra } : {}),
          }))
          .filter((m: any) => m.id)
      : [],
  }
}
