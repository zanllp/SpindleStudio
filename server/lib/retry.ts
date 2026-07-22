import { extractErrorMessage } from './error'

// The local VPN/proxy link flaps often (socket hang up, ETIMEDOUT, TLS resets).
// Transport-level failures are retried before giving up. Env overrides exist
// mainly for tests; defaults match the desired 5 retries at a 5s interval.
const MAX_RETRIES = Number(process.env.NETWORK_MAX_RETRIES) || 5
const RETRY_INTERVAL_MS = Number(process.env.NETWORK_RETRY_INTERVAL_MS) || 5000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Retryable = no HTTP response at all (connection reset / timeout / DNS / proxy
// down) or a gateway-level status the flaky proxy produces (502/503/504).
// Real API errors (4xx, other 5xx) fail immediately.
function isRetryable(error: any): boolean {
  const status = error?.response?.status
  if (status) return status === 502 || status === 503 || status === 504
  return true
}

// Wrap one upstream HTTP call. `fn` must rebuild any streaming bodies
// (e.g. FormData) per invocation so retries send a fresh payload.
export async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      if (attempt >= MAX_RETRIES || !isRetryable(error)) throw error
      console.warn(
        `${label} failed (${extractErrorMessage(error)}), retry ${attempt + 1}/${MAX_RETRIES} in ${RETRY_INTERVAL_MS / 1000}s`,
      )
      await sleep(RETRY_INTERVAL_MS)
    }
  }
}
