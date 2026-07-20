import axios from 'axios'
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
    const metaPrompt = `请根据以下用户消息，为这段对话生成一个简短的标题。
要求：
- 标题不超过15个字
- 准确概括用户想要生成的图片内容或主题
- 只输出标题本身，不要引号、编号、结尾标点或任何解释

用户消息：
${dialog}`

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
    if (!title) throw new Error('AI 未返回有效标题')
    return title.slice(0, 30)
  },
}

export default api
