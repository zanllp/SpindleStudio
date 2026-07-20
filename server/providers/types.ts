// Shared types for the image-generation provider abstraction.
// Two execution modes exist:
//   - 'apimart-task'  : async upstream — submit returns a task id, results come from polling
//   - 'openai-images' : synchronous OpenAI-compatible API, wrapped in a local task so the
//                       frontend can keep its uniform submit -> poll flow
export type ProviderType = 'apimart-task' | 'openai-images'

export interface ProviderModel {
  id: string // model id sent to the upstream API
  label: string // display name in the UI
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
}
