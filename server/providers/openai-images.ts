import axios from 'axios'
import { extractErrorMessage } from '../lib/error'
import { withRetry } from '../lib/retry'
import { executeOpenRouter } from './openrouter-images'
import { makeSyncAdapter } from './sync-task'
import type {
  GenerateSubmitInput,
  GenerationTask,
  ImageSource,
  PollOutcome,
  ProviderAdapter,
  ProviderConfig,
} from './types'

// Synchronous OpenAI-compatible providers (OpenAI official / custom
// OpenAI-compatible endpoints). The upstream API returns the finished image in
// one request; makeSyncAdapter wraps it in a local task so the frontend keeps
// its uniform submit -> poll flow. The upstream request fires on the first
// poll — the frontend waits ~15s before its first poll anyway, and generations
// typically take 20-60s.

// The UI always shows unified 1K/2K/4K options; OpenAI-style APIs take quality levels
const RESOLUTION_TO_QUALITY: Record<string, string> = {
  '1k': 'low',
  '2k': 'medium',
  '4k': 'high',
}

// OpenAI sizes only cover three fixed geometries — map any aspect ratio to the closest
function mapSize(ratio: string): string {
  if (!ratio || ratio === 'auto') return 'auto'
  if (ratio === '1:1') return '1024x1024'
  const [w, h] = ratio.split(':').map(Number)
  if (!w || !h) return 'auto'
  return w >= h ? '1536x1024' : '1024x1536'
}

async function execute(
  task: GenerationTask,
  provider: ProviderConfig,
  runtimeInput?: GenerateSubmitInput,
): Promise<PollOutcome> {
  // A custom provider pointed at OpenRouter must use the dedicated Image API
  // (POST /images) — OpenRouter has no OpenAI-compatible /images/generations
  if (/openrouter\.ai/.test(provider.baseUrl)) {
    return executeOpenRouter(task, provider, runtimeInput)
  }
  try {
    const referenceImages = runtimeInput?.image_urls || []
    let data: any
    if (referenceImages.length && provider.id === 'openai') {
      // OpenAI official image editing goes through the multipart /images/edits
      // endpoint. callEditsEndpoint rebuilds the FormData on every attempt so
      // retries never reuse a consumed stream.
      data = await withRetry(
        () => callEditsEndpoint(task, provider, referenceImages),
        `openai edits [${provider.id}/${task.modelId}]`,
      )
    } else {
      const payload: Record<string, any> = {
        model: task.modelId,
        prompt: task.prompt,
        n: 1,
        size: mapSize(task.size),
        quality: RESOLUTION_TO_QUALITY[task.resolution] || 'auto',
        ...task.extra,
      }
      // OpenAI-compatible providers accept reference images inline
      if (referenceImages.length) payload.image = referenceImages
      const response = await withRetry(
        () => axios.post(`${provider.baseUrl}/images/generations`, payload, {
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 600000,
        }),
        `openai submit [${provider.id}/${task.modelId}]`,
      )
      data = response.data
    }
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

// OpenAI official /images/edits (multipart). Reference images are base64 data URLs.
async function callEditsEndpoint(
  task: GenerationTask,
  provider: ProviderConfig,
  referenceImages: string[],
): Promise<any> {
  const form = new FormData()
  form.append('model', task.modelId)
  form.append('prompt', task.prompt)
  form.append('n', '1')
  const size = mapSize(task.size)
  if (size !== 'auto') form.append('size', size)
  form.append('quality', RESOLUTION_TO_QUALITY[task.resolution] || 'auto')
  referenceImages.forEach((dataUrl, i) => {
    const match = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/)
    const mime = match?.[1] || 'image/png'
    const raw = match?.[2] || dataUrl
    const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    form.append('image[]', new Blob([Buffer.from(raw, 'base64')], { type: mime }), `ref_${i}.${ext}`)
  })
  const response = await axios.post(`${provider.baseUrl}/images/edits`, form, {
    headers: { 'Authorization': `Bearer ${provider.apiKey}` },
    timeout: 600000,
  })
  return response.data
}

export const openaiImagesAdapter: ProviderAdapter = makeSyncAdapter(execute)
