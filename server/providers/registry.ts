import { apimartAdapter } from './apimart'
import { openaiImagesAdapter } from './openai-images'
import { openrouterImagesAdapter } from './openrouter-images'
import type { ProviderAdapter, ProviderType } from './types'

// UI-facing capability hints, declared per adapter type and exposed to the
// frontend via GET /api/config (merged into each provider as `uiHints`, never
// persisted). Lets the UI render provider-specific constraints without
// hardcoding provider types in components.
export interface ProviderUiHints {
  // Aspect ratios the provider supports. When absent the UI shows the full set.
  sizes?: string[]
  // 4K resolution is only offered for widescreen aspect ratios (API Mart limit)
  widescreenOnly4k?: boolean
  // With reference images + auto aspect ratio, force this resolution
  // (API Mart img2img behaves best at 1k)
  i2iAutoResolution?: string
}

// Aspect ratios shared by most OpenRouter image models via the Fusion API.
// Extended ratios (1:2, 2:1, 9:21, 1:4, 4:1, 1:8, 8:1) are only available on
// google/gemini-3.1-flash-image-preview — they are intentionally omitted from
// the common set to avoid confusing users.
const OPENROUTER_COMMON_SIZES = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '21:9']
// API Mart (gpt-image-2) supports a wider range including all common DALL·E ratios
const APIMART_SIZES = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '21:9', '9:21']
// OpenAI native images endpoint — DALL·E-era ratios
const OPENAI_SIZES = ['auto', '1:1', '16:9', '9:16']

interface AdapterEntry {
  type: ProviderType
  adapter: ProviderAdapter
  uiHints?: ProviderUiHints
}

// Single registration point for provider adapters. Adding a provider type:
//   1) create the adapter file, 2) add one entry here.
// Config sanitization, the HTTP layer and the frontend hints all derive from
// this list — nothing else needs updating.
export const ADAPTER_REGISTRY: AdapterEntry[] = [
  {
    type: 'apimart-task',
    adapter: apimartAdapter,
    uiHints: { sizes: APIMART_SIZES, widescreenOnly4k: true, i2iAutoResolution: '1k' },
  },
  { type: 'openai-images', adapter: openaiImagesAdapter, uiHints: { sizes: OPENAI_SIZES } },
  { type: 'openrouter-images', adapter: openrouterImagesAdapter, uiHints: { sizes: OPENROUTER_COMMON_SIZES } },
]

// Provider adapters keyed by provider type
export const adapters: Record<string, ProviderAdapter> = Object.fromEntries(
  ADAPTER_REGISTRY.map(e => [e.type, e.adapter]),
)

const KNOWN_TYPES = new Set<string>(ADAPTER_REGISTRY.map(e => e.type))

// Unknown types are coerced to this on save — legacy behavior for user-added
// OpenAI-compatible providers
export const FALLBACK_PROVIDER_TYPE: ProviderType = 'openai-images'

export function isKnownProviderType(type: unknown): type is ProviderType {
  return typeof type === 'string' && KNOWN_TYPES.has(type)
}

export function uiHintsForType(type: string): ProviderUiHints | undefined {
  return ADAPTER_REGISTRY.find(e => e.type === type)?.uiHints
}
