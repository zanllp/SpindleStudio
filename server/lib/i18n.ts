import type { Request } from 'express'

// User-facing server messages, resolved per request from Accept-Language.
// The frontend sends the current UI locale in that header (see src/api/index.ts),
// so error toasts match the language the user sees.
type Locale = 'zh' | 'en'

const MESSAGES = {
  unknownProvider: {
    zh: '未知供应商，请在设置中检查供应商配置',
    en: 'Unknown provider. Check the provider configuration in Settings',
  },
  apiKeyMissing: {
    zh: '{provider} 的 API Key 未配置，请先在设置中填写',
    en: 'API Key for {provider} is not configured. Fill it in Settings first',
  },
  promptRequired: {
    zh: '缺少提示词',
    en: 'Prompt is required',
  },
  providerGone: {
    zh: '任务所属供应商 {id} 已不存在',
    en: 'The provider {id} for this task no longer exists',
  },
  legacyKeyMissing: {
    zh: 'API Mart 的 API Key 未配置，无法恢复旧任务',
    en: 'API Mart API Key is not configured; cannot resume the legacy task',
  },
  aiChatNotConfigured: {
    zh: 'OpenAI API Key 未配置（可选功能，在设置中填写后可用）',
    en: 'OpenAI API Key is not configured (optional feature; fill it in Settings to enable)',
  },
  invalidConversationId: {
    zh: '非法会话 ID',
    en: 'Invalid conversation ID',
  },
  conversationNotFound: {
    zh: '会话不存在',
    en: 'Conversation not found',
  },
  conversationMismatch: {
    zh: '会话数据与 ID 不匹配',
    en: 'Conversation data does not match the ID',
  },
  base64Required: {
    zh: '缺少 base64 图片数据',
    en: 'Missing base64 image data',
  },
  unsupportedImageType: {
    zh: '仅支持 png/jpg/webp/gif 图片',
    en: 'Only png/jpg/webp/gif images are supported',
  },
  invalidPath: {
    zh: '非法路径',
    en: 'Invalid path',
  },
  newConversationTitle: {
    zh: '新对话',
    en: 'New Conversation',
  },
} as const

export type ServerMessageKey = keyof typeof MESSAGES

export function resolveLocale(req: Request): Locale {
  const header = req.headers['accept-language'] || ''
  return /\bzh\b/i.test(header) ? 'zh' : 'en'
}

export function t(req: Request, key: ServerMessageKey, params?: Record<string, string>): string {
  let text: string = MESSAGES[key][resolveLocale(req)]
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, v)
    }
  }
  return text
}
