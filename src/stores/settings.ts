import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '@/api'
import { t } from '@/i18n'
import type { AppConfig, PromptSnippet, ProviderConfig, ProviderModel } from '@/types'

// localStorage key remembering the last selected provider/model
const SELECTED_MODEL_KEY = 'app_selected_model'

function genCustomProviderId(): string {
  return `custom_${Math.random().toString(36).slice(2, 10)}`
}

function genSnippetId(): string {
  return `snippet_${Math.random().toString(36).slice(2, 10)}`
}

export const useSettingsStore = defineStore('settings', () => {
  const config = ref<AppConfig>({ providers: [], aiChat: { apiKey: '', baseUrl: '', model: 'gpt-4o-mini' }, promptSnippets: [] })
  const loaded = ref(false)
  const settingsOpen = ref(false)
  // Section the settings page should land on next time it opens (set by deep
  // links like the input box's "go add snippet" empty state)
  const initialSection = ref('')
  const selectedProviderId = ref('')
  const selectedModelId = ref('')

  const providers = computed(() => config.value.providers)
  // Models the user has switched on (absent flag = enabled); preset models ship disabled
  const enabledModels = (p: ProviderConfig) => p.models.filter(m => m.enabled !== false)
  // Providers the user can actually generate with right now
  const usableProviders = computed(() =>
    config.value.providers.filter(p => p.enabled && p.apiKey && enabledModels(p).length > 0),
  )
  const hasUsableProvider = computed(() => usableProviders.value.length > 0)

  const selectedProvider = computed(() => providers.value.find(p => p.id === selectedProviderId.value))
  const selectedModel = computed(() => selectedProvider.value?.models.find(m => m.id === selectedModelId.value))
  // Effective selection: falls back to the first usable provider when the stored
  // selection points at a disabled/deleted provider or model
  const effectiveSelection = computed<{ provider?: ProviderConfig; model?: ProviderModel }>(() => {
    const provider = selectedProvider.value
    if (provider && provider.enabled && provider.apiKey) {
      const models = enabledModels(provider)
      const model = models.find(m => m.id === selectedModelId.value) || models[0]
      if (model) return { provider, model }
    }
    const fallback = usableProviders.value[0]
    return { provider: fallback, model: fallback ? enabledModels(fallback)[0] : undefined }
  })

  async function loadConfig() {
    config.value = await api.getConfig()
    loaded.value = true
    // Restore the last selection, otherwise default to the first usable provider
    const saved = localStorage.getItem(SELECTED_MODEL_KEY)
    if (saved) {
      const [providerId, modelId] = saved.split('::')
      const provider = providers.value.find(p => p.id === providerId)
      if (provider?.models.some(m => m.id === modelId)) {
        selectedProviderId.value = providerId
        selectedModelId.value = modelId
        return
      }
    }
    const first = usableProviders.value[0] || providers.value[0]
    selectedProviderId.value = first?.id || ''
    selectedModelId.value = (first ? enabledModels(first)[0] : undefined)?.id || ''
  }

  function selectModel(providerId: string, modelId: string) {
    selectedProviderId.value = providerId
    selectedModelId.value = modelId
    localStorage.setItem(SELECTED_MODEL_KEY, `${providerId}::${modelId}`)
  }

  async function saveProviders(next: ProviderConfig[]) {
    config.value = await api.saveConfig({ providers: next })
  }

  async function saveAiChat(apiKey: string, baseUrl: string, model: string) {
    config.value = await api.saveConfig({ aiChat: { apiKey, baseUrl, model } })
  }

  // ==================== 常用提示词 ====================

  const promptSnippets = computed(() => config.value.promptSnippets ?? [])

  async function savePromptSnippets(next: PromptSnippet[]) {
    config.value = await api.saveConfig({ promptSnippets: next })
  }

  // init lets callers prefill a snippet being collected (e.g. from a chat message)
  async function addPromptSnippet(init?: { title?: string; prompt?: string }): Promise<PromptSnippet> {
    const snippet: PromptSnippet = {
      id: genSnippetId(),
      title: init?.title ?? '',
      prompt: init?.prompt ?? '',
    }
    await savePromptSnippets([...promptSnippets.value, snippet])
    return snippet
  }

  function updatePromptSnippet(id: string, patch: Partial<Omit<PromptSnippet, 'id'>>) {
    return savePromptSnippets(promptSnippets.value.map(s => (s.id === id ? { ...s, ...patch } : s)))
  }

  function removePromptSnippet(id: string) {
    return savePromptSnippets(promptSnippets.value.filter(s => s.id !== id))
  }

  function updateProvider(id: string, patch: Partial<ProviderConfig>) {
    return saveProviders(providers.value.map(p => (p.id === id ? { ...p, ...patch } : p)))
  }

  function addCustomProvider(): ProviderConfig {
    const provider: ProviderConfig = {
      id: genCustomProviderId(),
      name: t('settings.providers.defaultCustomName'),
      type: 'openai-images',
      enabled: true,
      apiKey: '',
      baseUrl: '',
      models: [],
      custom: true,
    }
    void saveProviders([...providers.value, provider])
    return provider
  }

  function removeProvider(id: string) {
    return saveProviders(providers.value.filter(p => p.id !== id))
  }

  function getProvider(id: string): ProviderConfig | undefined {
    return providers.value.find(p => p.id === id)
  }

  // Display label for a message's provider/model (old messages only carry provider)
  function providerLabel(providerId: string, modelId?: string): string {
    const provider = getProvider(providerId)
    if (!provider) return providerId
    const model = modelId ? provider.models.find(m => m.id === modelId) : provider.models[0]
    return model ? `${provider.name} · ${model.label}` : provider.name
  }

  return {
    config,
    loaded,
    settingsOpen,
    initialSection,
    providers,
    usableProviders,
    hasUsableProvider,
    selectedProviderId,
    selectedModelId,
    selectedProvider,
    selectedModel,
    effectiveSelection,
    loadConfig,
    selectModel,
    saveProviders,
    saveAiChat,
    updateProvider,
    addCustomProvider,
    removeProvider,
    getProvider,
    providerLabel,
    promptSnippets,
    savePromptSnippets,
    addPromptSnippet,
    updatePromptSnippet,
    removePromptSnippet,
  }
})
