import { promises as fs } from 'fs'
import path from 'path'
import type { ProviderConfig } from '../providers/types'

// App configuration managed by the settings page. Persisted to config.json.
// Priority: config.json (in-app settings) > environment variables > defaults below.
export interface AiChatConfig {
  apiKey: string
  baseUrl: string
}

export interface AppConfig {
  providers: ProviderConfig[]
  aiChat: AiChatConfig
}

export const DEFAULT_APIMART_BASE_URL = 'https://api.apimart.ai/v1'
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

let configFile = ''
let appConfig: AppConfig = { providers: [], aiChat: { apiKey: '', baseUrl: DEFAULT_OPENAI_BASE_URL } }

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
      type: 'openai-images',
      enabled: true,
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL,
      models: [
        { id: 'openai/gpt-image-1', label: 'openai/gpt-image-1' },
        { id: 'google/gemini-2.5-flash-image', label: 'gemini-2.5-flash-image' },
      ],
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
  appConfig = {
    providers: defaultProviders(),
    aiChat: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
    },
  }

  let saved: any = null
  try {
    // Strip a possible BOM — some editors write UTF-8 with one and JSON.parse rejects it
    const raw = await fs.readFile(configFile, 'utf-8')
    saved = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw)
  } catch {
    // No config file yet — env/defaults only
  }

  if (saved) {
    if (Array.isArray(saved.providers)) {
      // Current schema
      appConfig.providers = saved.providers
      if (saved.aiChat) {
        appConfig.aiChat = { ...appConfig.aiChat, ...saved.aiChat }
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
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  if (Array.isArray(patch.providers)) {
    appConfig.providers = patch.providers.map(sanitizeProvider).filter(p => p.id)
  }
  if (patch.aiChat) {
    appConfig.aiChat = {
      apiKey: typeof patch.aiChat.apiKey === 'string' ? patch.aiChat.apiKey.trim() : appConfig.aiChat.apiKey,
      baseUrl: normalizeBaseUrl(patch.aiChat.baseUrl, DEFAULT_OPENAI_BASE_URL),
    }
  }
  await persistConfig()
  return appConfig
}

function normalizeBaseUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/\/+$/, '') || fallback
}

function sanitizeProvider(p: any): ProviderConfig {
  const type = p?.type === 'apimart-task' ? 'apimart-task' : 'openai-images'
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
            ...(m?.extra && typeof m.extra === 'object' ? { extra: m.extra } : {}),
          }))
          .filter((m: any) => m.id)
      : [],
  }
}
