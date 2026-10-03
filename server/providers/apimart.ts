import axios from 'axios'
import { randomUUID } from 'crypto'
import { withRetry } from '../lib/retry'
import type {
  GenerateSubmitInput,
  GenerationTask,
  PollOutcome,
  ProviderAdapter,
  ProviderConfig,
  ProviderModel,
} from './types'

// API Mart runs generations asynchronously: submit returns a task id,
// results are fetched by polling /tasks/:id.
async function submit(
  input: GenerateSubmitInput,
  provider: ProviderConfig,
  model: ProviderModel,
): Promise<{ taskId: string }> {
  if (model.capabilities?.allowImageInput === false && input.image_urls?.length) {
    throw new Error(`${model.id} only supports text-to-image; reference images are not allowed`)
  }
  const size = normalizeSize(input.size, model)
  const payload: Record<string, any> = {
    model: model.id,
    prompt: input.prompt,
    n: input.n || 1,
    size,
    resolution: input.resolution || '1k',
    ...model.extra,
  }
  if (input.image_urls?.length) payload.image_urls = input.image_urls
  const idempotencyKey = randomUUID()
  const response = await withRetry(
    () => axios.post(`${provider.baseUrl}/images/generations`, payload, {
      headers: {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'X-APIMart-Response-Version': '2026-07-27',
      },
      // img2img uploads base64 reference images — allow a longer timeout
      timeout: 120000,
    }),
    `apimart submit [${provider.id}/${model.id}]`,
  )
  if (response.data?.error) {
    throw new Error(response.data.error.message || 'image API error')
  }
  const taskData = Array.isArray(response.data.data) ? response.data.data[0] : response.data.data
  const taskId = taskData?.id || taskData?.task_id
  if (!taskId) throw new Error('No task id in API Mart response')
  return { taskId: String(taskId) }
}

function normalizeSize(size: string | undefined, model: ProviderModel): string {
  const caps = model.capabilities
  if (!caps?.sizes?.length) return size || 'auto'
  const value = size || caps.defaultSize || caps.sizes[0]
  return caps.sizes.includes(value) ? value : caps.defaultSize || caps.sizes[0]
}

async function poll(task: GenerationTask, provider: ProviderConfig): Promise<PollOutcome> {
  const response = await withRetry(
    () => axios.get(`${provider.baseUrl}/tasks/${task.taskId}`, {
      headers: { 'Authorization': `Bearer ${provider.apiKey}` },
      timeout: 60000,
    }),
    `apimart poll [${task.taskId}]`,
  )
  const taskData = response.data.data
  if (taskData.status === 'completed') {
    const urls: string[] = []
    for (const img of taskData.result?.images || []) {
      const u = Array.isArray(img?.url) ? img.url[0] : img?.url
      if (u) urls.push(u)
    }
    if (!urls.length) return { status: 'failed', error: 'No image URL in response' }
    return { status: 'completed', sources: urls.map(url => ({ url })) }
  }
  if (taskData.status === 'failed') {
    const error = typeof taskData.error === 'object' ? taskData.error?.message : taskData.error || 'unknown error'
    return { status: 'failed', error }
  }
  return { status: 'pending' }
}

export const apimartAdapter: ProviderAdapter = { submit, poll }
