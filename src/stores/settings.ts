import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import api from '@/api'
import type { AppConfig, ProviderConfig, ProviderModel } from '@/types'

// localStorage key remembering the last selected provider/model
const SELECTED_MODEL_KEY = 'app_selected_model'

function genCustomProviderId(): string {
  return `custom_${Math.random().toString(36).slice(2, 10)}`
}

export const useSettingsStore = defineStore('settings', () => {
  const config = ref<AppConfig>({ providers: [], aiChat: { apiKey: '', baseUrl: '' } })
  const loaded = ref(false)
  const settingsOpen = ref(false)
  const selectedProviderId = ref('')
  const selectedModelId = ref('')

  const providers = computed(() => config.value.providers)
  // Providers the user can actually generate with right now
  const usableProviders = computed(() =>
    config.value.providers.filter(p => p.enabled && p.apiKey && p.models.length > 0),
  )
  const hasUsableProvider = computed(() => usableProviders.value.length > 0)

  const selectedProvider = computed(() => providers.value.find(p => p.id === selectedProviderId.value))
  const selectedModel = computed(() => selectedProvider.value?.models.find(m => m.id === selectedModelId.value))
  // Effective selection: falls back to the first usable provider when the stored
  // selection points at a disabled/deleted provider
  const effectiveSelection = computed<{ provider?: ProviderConfig; model?: ProviderModel }>(() => {
    const provider = selectedProvider.value
    if (provider && provider.enabled && provider.apiKey) {
      const model = provider.models.find(m => m.id === selectedModelId.value) || provider.models[0]
      if (model) return { provider, model }
    }
    const fallback = usableProviders.value[0]
    return { provider: fallback, model: fallback?.models[0] }
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
    selectedModelId.value = first?.models[0]?.id || ''
  }

  function selectModel(providerId: string, modelId: string) {
    selectedProviderId.value = providerId
    selectedModelId.value = modelId
    localStorage.setItem(SELECTED_MODEL_KEY, `${providerId}::${modelId}`)
  }

  async function saveProviders(next: ProviderConfig[]) {
    config.value = await api.saveConfig({ providers: next })
  }

  async function saveAiChat(apiKey: string, baseUrl: string) {
    config.value = await api.saveConfig({ aiChat: { apiKey, baseUrl } })
  }

  function updateProvider(id: string, patch: Partial<ProviderConfig>) {
    return saveProviders(providers.value.map(p => (p.id === id ? { ...p, ...patch } : p)))
  }

  function addCustomProvider(): ProviderConfig {
    const provider: ProviderConfig = {
      id: genCustomProviderId(),
      name: '自定义供应商',
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
  }
})
