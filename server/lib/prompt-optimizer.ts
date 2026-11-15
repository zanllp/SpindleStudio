import axios from 'axios'

// Runs one preset optimizer over the user's prompt. The caller (the HTTP route)
// has already resolved WHICH preset is used — this module never picks, merges or
// chains presets: one request = one system prompt = one rewrite.
export interface PromptOptimizerAiConfig {
  baseUrl: string
  apiKey: string
  model: string
  systemPrompt: string
}

export interface PromptOptimizeResult {
  optimizerId: string
  model: string
  prompt: string
}

function assistantText(data: any): string {
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((part: any) => typeof part === 'string' ? part : part?.text || '').join('')
  }
  return ''
}

export async function optimizePrompt(
  optimizerId: string,
  prompt: string,
  config: PromptOptimizerAiConfig,
): Promise<PromptOptimizeResult> {
  if (!config.model) throw new Error('Prompt optimizer model is not configured')
  if (!config.systemPrompt.trim()) throw new Error('Prompt optimizer system prompt is not configured')
  const baseUrl = config.baseUrl.endsWith('/') ? config.baseUrl.slice(0, -1) : config.baseUrl

  const response = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: config.systemPrompt },
        { role: 'user', content: prompt },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'SpindleStudio Prompt Optimizer',
      },
      timeout: 90000,
    },
  )

  const optimizedPrompt = assistantText(response.data).trim()
  if (!optimizedPrompt) throw new Error('Prompt optimizer returned an empty response')
  return { optimizerId, model: config.model, prompt: optimizedPrompt }
}
