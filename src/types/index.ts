// TypeScript type definitions

export interface ImageMetadata {
  prompt: string
  negative_prompt?: string
  provider: string
  model: string
  model_hash: string
  version: string
  size: string // actual pixel dimensions, e.g. "1024x1536"
  aspect_ratio: string
  resolution: string
  width: number
  height: number
  created_at: number
  sampler: string
  steps: number
  cfg_scale: number
  seed: number
  custom_metadata?: Record<string, any>
}

// ==================== Provider config ====================

// Mirrors the server union; runtime registration lives in server/providers/registry.ts
export type ProviderType = 'apimart-task' | 'openai-images' | 'openrouter-images'

// UI-facing capability hints, code-derived per provider type and merged into
// each provider by GET /api/config (never persisted to config.json)
export interface ProviderUiHints {
  // Aspect ratios the provider supports; absent = show all
  sizes?: string[]
  // 4K resolution is only offered for widescreen aspect ratios
  widescreenOnly4k?: boolean
  // With reference images + auto aspect ratio, force this resolution
  i2iAutoResolution?: string
}

export interface ProviderModel {
  id: string // model id sent to the upstream API
  label: string // display name in the UI
  // Preset models can be shipped disabled — the user opts in from Settings.
  // Absent means enabled (backward compatible with older configs).
  enabled?: boolean
  // Extra fields merged into the upstream payload (e.g. { official_fallback: true })
  extra?: Record<string, any>
}

export interface ProviderConfig {
  id: string
  name: string
  type: ProviderType
  enabled: boolean
  apiKey: string
  baseUrl: string
  models: ProviderModel[]
  custom?: boolean // user-added providers can be renamed/deleted
  uiHints?: ProviderUiHints // code-derived, merged by GET /api/config
}

export interface AiChatConfig {
  apiKey: string
  baseUrl: string
  model: string
}

// App configuration managed by the settings page
export interface AppConfig {
  providers: ProviderConfig[]
  aiChat: AiChatConfig
}

// Image generation request (proxied to the configured provider API)
export interface GenerateRequest {
  providerId: string
  modelId: string
  prompt: string
  n: number
  size: string
  resolution: string
  imageCategory?: string
  image_urls?: string[]
  referenceImagePaths?: string[] // original relative paths for img2img metadata (not sent to upstream)
}

// ==================== Chat types ====================

// Generation provider (provider id from AppConfig.providers)
export type ChatProvider = string

// Reference image carried by a user message (drives img2img)
export interface ChatReferenceImage {
  id: string
  source: 'generated' | 'upload' // reuse a generated image / local upload
  url: string                    // /images/... or /uploads/...
  relativePath: string
}

// Generated image (assistant message result)
export interface ChatGeneratedImage {
  id: string
  url: string
  filename: string
  prompt: string
  provider: ChatProvider
  model?: string
  generationTime?: number
  metadata?: ImageMetadata
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  prompt: string
  referenceImages: ChatReferenceImage[]  // carried by user messages
  generatedImages: ChatGeneratedImage[]  // assistant message results
  status: 'generating' | 'done' | 'error'
  provider: ChatProvider
  model?: string  // model id used for this turn
  count?: number  // number of images requested for this turn
  // Multiple images are split into independent tasks (one request each);
  // task ids are persisted so polling can resume after a page refresh
  taskIds?: string[]
  taskId?: string  // legacy single-task field, read-only compat
  // Notice shown when some tasks failed (status is done, but fewer images than count)
  partialError?: string
  failedCount?: number
  error?: string
  createdAt: number
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
}

export interface ConversationSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

// Upload history item (cross-conversation reference image pool)
export interface UploadHistoryItem {
  url: string
  relativePath: string
  filename: string
  useCount: number
  uploadedAt: number
}
