// Shared types for the image-generation provider abstraction.
// Three execution modes exist:
//   - 'apimart-task'      : async upstream — submit returns a task id, results come from polling
//   - 'openai-images'     : synchronous OpenAI-compatible API (/images/generations)
//   - 'openrouter-images' : OpenRouter's dedicated Image API (POST /images), sync
// Synchronous modes are wrapped in a local task so the frontend can keep its
// uniform submit -> poll flow.
// Runtime registration lives in registry.ts — add new types there AND here.
export type ProviderType = 'apimart-task' | 'openai-images' | 'openrouter-images'

// Model-level capability hints. UI merges these over the provider-level hints
// so one provider can host models with different aspect-ratio/resolution
// support (e.g. API Mart gpt-image-2 vs the GPT-Image-2.5 presets).
export interface ProviderModelCapabilities {
  // 画面比例（'1:1'）或供应商给的像素尺寸（'1024x1024'）。后者原样透传给上游。
  sizes?: string[]
  defaultSize?: string
  resolutions?: string[]
  allowImageInput?: boolean
  // Overrides the provider-level "4K only on widescreen" hint. GPT-Image-2.5
  // supports 4K on every aspect ratio, so presets opt out with false.
  widescreenOnly4k?: boolean
}

// 单张图的价格，用于把成本写进图片元数据。缺省表示未知 —— 元数据里就不写成本。
export interface ProviderModelPricing {
  perImage?: number
  currency?: string // ISO 4217，默认 USD
}

export interface ProviderModel {
  id: string // model id sent to the upstream API
  label: string // display name in the UI
  // Preset models can be shipped disabled — the user opts in from Settings.
  // Absent means enabled (backward compatible with older configs).
  enabled?: boolean
  // Extra fields merged into the upstream payload (e.g. { official_fallback: true })
  extra?: Record<string, any>
  capabilities?: ProviderModelCapabilities
  pricing?: ProviderModelPricing
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
  timeoutMs?: number // per-provider HTTP timeout for sync image providers
  resetQueueOnStart?: boolean // clear stale upstream jobs before accepting new runs
}

// Unified input the frontend submits for one generation task
export interface GenerateSubmitInput {
  providerId: string
  modelId: string
  prompt: string
  n: number
  size: string // aspect ratio ('auto', '1:1', '16:9', ...)
  resolution: string // '1k' | '2k' | '4k' — mapped per provider
  imageCategory?: string
  image_urls?: string[] // base64 data URLs (reference images)
  referenceImagePaths?: string[] // original relative paths for metadata only
}

// A task as persisted in tasks.json (reference image payloads are NOT persisted)
export interface GenerationTask {
  taskId: string
  providerId: string
  modelId: string
  status: 'pending' | 'completed' | 'failed'
  prompt: string
  size: string
  resolution: string
  imageCategory?: string
  extra?: Record<string, any>
  referenceImagePaths?: string[] // original relative paths for metadata only
  createdAt: number
  updatedAt: number
  // Cached response once finished — repeated polls return this as-is
  payload?: Record<string, any>
  error?: string
}

export interface ImageSource {
  url?: string
  base64?: string
}

export interface PollOutcome {
  status: 'pending' | 'completed' | 'failed'
  sources?: ImageSource[] // present when completed
  error?: string // present when failed
}

export interface ProviderAdapter {
  submit(input: GenerateSubmitInput, provider: ProviderConfig, model: ProviderModel): Promise<{ taskId: string }>
  // runtimeInput carries the non-persisted submit data (reference images) for sync providers
  poll(task: GenerationTask, provider: ProviderConfig, runtimeInput?: GenerateSubmitInput): Promise<PollOutcome>
  // Optional provider-specific queue reset used when the app restarts.
  resetRemoteQueue?(provider: ProviderConfig): Promise<Record<string, any>>
}
