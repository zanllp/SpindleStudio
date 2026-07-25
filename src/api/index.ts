import axios from 'axios'
import { i18n, t } from '@/i18n'
import type {
  GenerateRequest,
  Conversation,
  ConversationSummary,
  UploadHistoryItem,
  AppConfig,
} from '@/types'

const apiClient = axios.create({
  timeout: 300000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Send the current UI locale so server-side messages come back in the same language
apiClient.interceptors.request.use(config => {
  config.headers['Accept-Language'] = i18n.global.locale.value
  return config
})

export const api = {
  // ==================== App config ====================

  async getConfig(): Promise<AppConfig> {
    const response = await apiClient.get('/api/config')
    return response.data
  },

  async saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
    const response = await apiClient.put('/api/config', patch)
    return response.data
  },

  // Import providers from an existing data directory (welcome modal)
  async importConfig(dataDir: string): Promise<AppConfig & { imported: number }> {
    const response = await apiClient.post('/api/config/import', { dataDir })
    return response.data
  },

  // Refresh OpenRouter model list from upstream discovery API
  async refreshProviderModels(providerId: string): Promise<AppConfig & { removed?: string[] }> {
    const response = await apiClient.post(`/api/providers/${providerId}/refresh-models`)
    return response.data
  },

  // Get data directory paths (for Settings > General)
  async getDataDirs(): Promise<{ dataDir: string; generatedImagesDir: string; conversationsDir: string; uploadsDir: string }> {
    const response = await apiClient.get('/api/data-dirs')
    return response.data
  },

  // Open a folder in the OS file manager
  async openFolder(path: string): Promise<{ success: boolean }> {
    const response = await apiClient.post('/api/open-folder', { path })
    return response.data
  },

  // ==================== Image generation ====================

  // Submit a generation task (unified across providers)
  async generateSubmit(request: GenerateRequest): Promise<{ task_id: string; status: string }> {
    const response = await apiClient.post('/api/generate/submit', request)
    return response.data
  },

  // Poll task status
  async generateTaskStatus(taskId: string): Promise<any> {
    const response = await apiClient.get(`/api/generate/task/${taskId}`)
    return response.data
  },

  // ==================== Conversations ====================

  async getConversations(): Promise<{ conversations: ConversationSummary[] }> {
    const response = await apiClient.get('/api/conversations')
    return response.data
  },

  async createConversation(title?: string): Promise<Conversation> {
    const response = await apiClient.post('/api/conversations', { title })
    return response.data
  },

  async getConversation(id: string): Promise<Conversation> {
    const response = await apiClient.get(`/api/conversations/${id}`)
    return response.data
  },

  async saveConversation(id: string, data: Conversation): Promise<{ success: boolean }> {
    const response = await apiClient.put(`/api/conversations/${id}`, data)
    return response.data
  },

  async deleteConversation(id: string): Promise<{ success: boolean }> {
    const response = await apiClient.delete(`/api/conversations/${id}`)
    return response.data
  },

  // Upload a reference image (base64 data URL)
  async uploadConversationImage(id: string, filename: string, base64: string): Promise<{ success: boolean; filename: string; relativePath: string; url: string }> {
    const response = await apiClient.post(`/api/conversations/${id}/upload`, { filename, base64 })
    return response.data
  },

  // Upload history (sorted by usage frequency)
  async getUploads(): Promise<{ uploads: UploadHistoryItem[] }> {
    const response = await apiClient.get('/api/uploads')
    return response.data
  },

  // Record reference image usage
  async recordUploadUsage(relativePath: string): Promise<{ success: boolean; useCount: number }> {
    const response = await apiClient.post('/api/uploads/usage', { relativePath })
    return response.data
  },

  // ==================== AI title (optional) ====================

  // Generic OpenAI-compatible chat completion passthrough
  async aiChat(messages: any[], model?: string, options?: any) {
    const response = await apiClient.post('/api/ai-chat', {
      model: model || 'gpt-4o-mini',
      messages,
      ...options
    })
    return response.data
  },

  // Summarize a conversation title from user messages
  async summarizeConversationTitle(userPrompts: string[], model: string = 'gpt-4o-mini'): Promise<string> {
    const dialog = userPrompts.map((p, i) => `${i + 1}. ${p}`).join('\n')
    // Prompt follows the UI locale so the generated title matches the user's language
    const metaPrompt = t('settings.aiChat.metaPrompt', { dialog })

    const result = await this.aiChat(
      [{ role: 'user', content: metaPrompt }],
      model,
      { temperature: 0.3, max_tokens: 50 }
    )

    // Clean up: first line, strip surrounding quotes/whitespace, cap length
    const title = (result.choices[0].message.content || '')
      .split('\n')[0]
      .trim()
      .replace(/^["'「『“”‘’]+|["'「『“”‘’。.,，]+$/g, '')
      .trim()
    if (!title) throw new Error(t('errors.aiInvalidTitle'))
    return title.slice(0, 30)
  },
}

export default api
