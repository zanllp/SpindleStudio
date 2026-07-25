import { randomBytes } from 'crypto'
import type {
  GenerateSubmitInput,
  GenerationTask,
  PollOutcome,
  ProviderAdapter,
  ProviderConfig,
} from './types'

export type SyncExecute = (
  task: GenerationTask,
  provider: ProviderConfig,
  runtimeInput?: GenerateSubmitInput,
) => Promise<PollOutcome>

// Synchronous upstream providers (OpenAI-compatible images API, OpenRouter Image
// API) return the finished image in one request; we wrap them in a local task so
// the frontend keeps its uniform submit -> poll flow. The upstream request fires
// on the first poll — the frontend waits ~15s before its first poll anyway, and
// generations typically take 20-60s.
//
// The inFlight map guards against duplicate execution when the same task is
// polled concurrently (multi-tab / resume). Reference images arrive as base64
// data URLs and are not persisted in tasks.json — the route layer hands them
// back via runtimeInput.
export function makeSyncAdapter(execute: SyncExecute): ProviderAdapter {
  const inFlight = new Map<string, Promise<PollOutcome>>()
  return {
    async submit(): Promise<{ taskId: string }> {
      return { taskId: `sync_${randomBytes(8).toString('hex')}` }
    },
    async poll(
      task: GenerationTask,
      provider: ProviderConfig,
      runtimeInput?: GenerateSubmitInput,
    ): Promise<PollOutcome> {
      let pending = inFlight.get(task.taskId)
      if (!pending) {
        pending = execute(task, provider, runtimeInput)
        inFlight.set(task.taskId, pending)
        const cleanup = () => inFlight.delete(task.taskId)
        pending.then(cleanup, cleanup)
      }
      return pending
    },
  }
}
