import axios from 'axios'
import { extractErrorMessage } from '../lib/error'
import { withRetry } from '../lib/retry'
import { makeSyncAdapter } from './sync-task'
import type {
  GenerateSubmitInput,
  GenerationTask,
  ImageSource,
  PollOutcome,
  ProviderAdapter,
  ProviderConfig,
} from './types'

// OpenRouter's dedicated Image API (https://openrouter.ai/docs/guides/overview/multimodal/image-generation).
// NOT the OpenAI-compatible /images/generations endpoint — OpenRouter serves image
// generation at POST {baseUrl}/images with normalized parameters (resolution tiers,
// aspect_ratio, input_references) and an OpenAI-shaped response
// ({ data: [{ b64_json, media_type }], usage }).
//
// Parameter support varies wildly between models (e.g. the gpt-image family takes
// `quality` but no `resolution`/`aspect_ratio`; flux/recraft take neither), so the
// payload is filtered against the free Image Models discovery API
// (GET {baseUrl}/images/models) whenever it is reachable.

// The UI always shows unified 1K/2K/4K options; OpenRouter wants uppercase tiers
const RESOLUTION_MAP: Record<string, string> = { '1k': '1K', '2k': '2K', '4k': '4K' }
// gpt-image-style models take quality levels instead of a resolution tier
const QUALITY_MAP: Record<string, string> = { '1k': 'low', '2k': 'medium', '4k': 'high' }

type CapabilityDescriptor = { type: string; values?: string[] }
type ModelCapabilities = Record<string, CapabilityDescriptor>

// Capability cache per baseUrl. The discovery endpoint is free and
// unauthenticated, but there is no need to refetch it on every generation.
const CAPS_TTL_MS = 10 * 60 * 1000
const capsCache = new Map<string, { at: number; models: Map<string, ModelCapabilities> }>()

async function fetchCapabilities(provider: ProviderConfig): Promise<Map<string, ModelCapabilities> | null> {
  const cached = capsCache.get(provider.baseUrl)
  if (cached && Date.now() - cached.at < CAPS_TTL_MS) return cached.models
  try {
    const resp = await withRetry(
      () => axios.get(`${provider.baseUrl}/images/models`, {
        headers: provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {},
        timeout: 30000,
      }),
      `openrouter image models [${provider.id}]`,
    )
    const models = new Map<string, ModelCapabilities>()
    for (const m of resp.data?.data || []) {
      if (m?.id) models.set(m.id, m.supported_parameters || {})
    }
    capsCache.set(provider.baseUrl, { at: Date.now(), models })
    return models
  } catch {
    // Discovery unreachable (custom baseUrl, offline) — caller sends best-effort params
    return null
  }
}

// True when `value` may be sent for `desc`: boolean/range descriptors accept
// anything, enum descriptors only their declared values
function allowed(desc: CapabilityDescriptor | undefined, value: string): boolean {
  if (!desc) return false
  if (desc.type === 'enum' && Array.isArray(desc.values)) return desc.values.includes(value)
  return true
}

async function buildPayload(
  task: GenerationTask,
  provider: ProviderConfig,
  referenceImages: string[],
): Promise<Record<string, any>> {
  const payload: Record<string, any> = {
    model: task.modelId,
    prompt: task.prompt,
    n: 1,
    ...task.extra,
  }
  const caps = (await fetchCapabilities(provider))?.get(task.modelId)
  const resolution = RESOLUTION_MAP[task.resolution]
  const quality = QUALITY_MAP[task.resolution]
  const aspectRatio = task.size && task.size !== 'auto' ? task.size : ''
  if (caps) {
    // Capabilities known — only send params this endpoint declares, and only
    // values inside its enum (a 400 would fail the whole task otherwise)
    if (resolution && allowed(caps.resolution, resolution)) payload.resolution = resolution
    else if (quality && allowed(caps.quality, quality)) payload.quality = quality
    if (aspectRatio && allowed(caps.aspect_ratio, aspectRatio)) payload.aspect_ratio = aspectRatio
  } else {
    // Capabilities unknown — best effort, OpenRouter clamps what it can
    if (resolution) payload.resolution = resolution
    if (aspectRatio) payload.aspect_ratio = aspectRatio
  }
  // Reference images arrive as base64 data URLs; the API also accepts http(s) URLs
  if (referenceImages.length && (!caps || caps.input_references)) {
    payload.input_references = referenceImages.map(url => ({
      type: 'image_url',
      image_url: { url },
    }))
  }
  return payload
}

// Shared with the openai-images adapter, which delegates here when a custom
// provider points at an openrouter.ai base URL
export async function executeOpenRouter(
  task: GenerationTask,
  provider: ProviderConfig,
  runtimeInput?: GenerateSubmitInput,
): Promise<PollOutcome> {
  try {
    const referenceImages = runtimeInput?.image_urls || []
    const payload = await buildPayload(task, provider, referenceImages)
    const response = await withRetry(
      () => axios.post(`${provider.baseUrl}/images`, payload, {
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 600000,
      }),
      `openrouter images [${provider.id}/${task.modelId}]`,
    )
    const data = response.data
    if (data?.error) {
      return { status: 'failed', error: data.error.message || 'image API error' }
    }
    const sources: ImageSource[] = []
    for (const item of data?.data || []) {
      if (item.b64_json) sources.push({ base64: item.b64_json })
      else if (item.url) sources.push({ url: item.url })
    }
    if (!sources.length) return { status: 'failed', error: 'No image in response' }
    return { status: 'completed', sources }
  } catch (error: any) {
    return { status: 'failed', error: extractErrorMessage(error) }
  }
}

export const openrouterImagesAdapter: ProviderAdapter = makeSyncAdapter(executeOpenRouter)
