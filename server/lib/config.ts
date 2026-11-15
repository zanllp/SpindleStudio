import { promises as fs } from 'fs'
import path from 'path'
import { FALLBACK_PROVIDER_TYPE, isKnownProviderType } from '../providers/registry'
import type { ProviderConfig, ProviderModel } from '../providers/types'

// App configuration managed by the settings page. Persisted to config.json.
// Priority: config.json (in-app settings) > environment variables > defaults below.
export interface AiChatConfig {
  apiKey: string
  baseUrl: string
  model: string
}

// Preset prompt optimizer. The UI lets the user pick exactly one per message —
// presets are never combined, and each request carries a single optimizer id.
export interface OptimizerPreset {
  id: string
  name: string
  prompt: string
}

// Saved prompt shortcut — filled into the chat input from the toolbar panel
export interface PromptSnippet {
  id: string
  title: string
  prompt: string
}

export interface AppConfig {
  providers: ProviderConfig[]
  aiChat: AiChatConfig
  promptSnippets: PromptSnippet[]
  optimizers: OptimizerPreset[]
}

export const DEFAULT_APIMART_BASE_URL = 'https://api.apimart.ai/v1'
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const DEFAULT_AIHUBMIX_BASE_URL = 'https://aihubmix.com/v1'

// 提示词优化器的默认系统提示词。它只是「优化器预设」里第一条的初始内容 ——
// 用户在设置页里可以增删改，服务端只发被选中的那一条，代码里没有第二份提示词。
// 核心问题：用户常写「房间里有许多物品」「人物之间有 5 句对话」这类只报数量、
// 不给内容的描述，模型不知道该画什么。优化器的主要职责就是把它翻译成具体对象。
// 依据：server-deploy/MOSS_PROMPT_GUIDE.md（文字渲染、4096 token、可验证姿势）
// 与 .agents/skills/moss-image-batch-prompt（一句场景 + 2~3 个具体道具最有效）。
export const DEFAULT_OPTIMIZER_PROMPT = `你是 MOSS-Image 的提示词编译器。用户写的是「想要什么」，你要翻译成「模型具体该画什么」。只输出改写后的提示词，不要解释、不要加引号包裹、不要 Markdown 标题、不要加"高质量/8K/杰作"这类空话。用输入的语言输出（中文进就中文出）。

一、最重要的一件事：把「数量」和「形容词」翻译成「可以画出来的具体东西」

用户经常只报数量和存在，不报内容，模型就看不懂，画出来是空的、糊的、乱的。遇到这类写法，你必须替他把内容补具体，这不是增加需求，是把需求落实：

- "房间里有许多物品""背景很满""lots of stuff" → 补 2 到 3 个符合该场景的具体道具，并写清位置。例如：沙发、茶几上拆开的零食袋、边柜上摆着的婚纱照、电视的蓝光。不要写"很多""各种""杂七杂八"。
- "人物之间有 5 句对话""充满对话""弹幕很多" → 必须写出具体台词。用户给了原台词就照抄；只说了数量就按剧情补 3 到 5 句短句，每句不超过 12 字；然后指定分格/分栏版式，每格一句、对应一个人物的半身画面。单张图最多放 1 条大标题或 2 句短文案，超过就必须分格，不要硬塞。
- "很乱""很温馨""很豪华""很有年味" → 换成 2 到 3 个能看出这件事的细节（"地上散着纸箱和拆开的快递""墙上贴着早生贵子"），不要堆形容词。
- "感觉画不出来""不知道放哪" → 直接给出主体在画面中的位置、朝向、机位。

二、补内容时的边界：可以补「具体化」，不可以改「剧情」

- 可以补：道具、陈设、材质、光影、机位、可验证的动作细节、按剧情合理推断的短台词。
- 不可以改：主体身份、人数关系、年龄、身材与脸部锚点、服装款式、画风、用户声明的排除项，以及用户已经写明的台词原文（引号里的字一个字都不改）。
- 补出来的东西必须符合场景和人物身份，不引入新人物、不增加新情节、不改变事件顺序。

三、剩下的信息要精简

- 道具总数控制在 2 到 3 个，选与主体或剧情最相关的，写在镜头拍得到的位置；不要列成清单，超过 4 个会把主体挤小。
- 一张图只有一个决定性瞬间；用户写了一串连续动作时，保留最能说明剧情的那一帧，其余转成静态描述（"刚回头，手还停在门把上"）。
- 主要人物超过 3 个时只画最关键的几个，其余用"背景里虚化的人群"带过。
- 文字要出现在画面上时：必须用引号原样写，需要换行就在引号里写 \\n，并交代位置、字号与颜色倾向（例如"顶部居中的深蓝大标题"）。

四、姿势和表情要写成可验证的句子

身体朝向、手脚位置、镜头距离与角度、表情的眼神方向和唇角状态都要落到具体描述。"身体正侧面、前脚掌着地、双手提着裙摆"胜过"侧身回眸"；"低头看着对方、嘴唇微张"胜过"表情暧昧"。

五、不要做的

不要堆同义词；不要扩写成小作文；不要写"画面精美""氛围感十足"这类没有画面内容的句子；不要重复用户已经写清楚的部分；不要在输出的提示词之外加任何说明文字。

六、输出格式

一段有结构的提示词：先一句话交代画面主体与场景，再分段写人物、动作、服饰、场景道具、画面文字、光线。段与段之间空一行，不要编号、不要小标题、不要解释。`

// Aspect ratios for API Mart GPT-Image-2.5 (flare/sunburst) — the full set
// including the new 3:1 / 1:3 extremes.
const APIMART_GPT_25_SIZES = [
  'auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5',
  '16:9', '9:16', '2:1', '1:2', '21:9', '9:21', '3:1', '1:3',
]
// GPT-Image-2.5 Ext exposes a slightly narrower ratio set.
const APIMART_GPT_25_EXT_SIZES = [
  'auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '21:9',
]
const APIMART_GPT_25_RESOLUTIONS = ['1k', '2k', '4k']

// API Mart GPT-Image-2.5 — flare/sunburst are separate model ids:
// https://docs.apimart.ai/cn/api-reference/images/gpt-image-2.5/generation
export const APIMART_GPT_25_FLARE_MODEL: ProviderModel = {
  id: 'gpt-image-2.5-flare',
  label: 'gpt-image-2.5 · Flare',
  capabilities: {
    sizes: APIMART_GPT_25_SIZES,
    resolutions: APIMART_GPT_25_RESOLUTIONS,
    // 4K is available for every ratio on 2.5 (including 1:1 and 3:1)
    widescreenOnly4k: false,
  },
}
export const APIMART_GPT_25_SUNBURST_MODEL: ProviderModel = {
  id: 'gpt-image-2.5-sunburst',
  label: 'gpt-image-2.5 · Sunburst',
  capabilities: {
    sizes: APIMART_GPT_25_SIZES,
    resolutions: APIMART_GPT_25_RESOLUTIONS,
    widescreenOnly4k: false,
  },
}

// API Mart GPT-Image-2.5 Ext — one upstream model id plus a version field:
// https://docs.apimart.ai/cn/api-reference/images/gpt-image-2.5-ext/generation
// The app exposes each version as its own selectable preset; `extra.model`
// overrides the request model while `version` picks flare/sunburst.
export const APIMART_GPT_25_EXT_FLARE_MODEL: ProviderModel = {
  id: 'gpt-image-2.5-ext-flare',
  label: 'gpt-image-2.5-ext · Flare',
  extra: { model: 'gpt-image-2.5-ext', version: 'flare' },
  capabilities: {
    sizes: APIMART_GPT_25_EXT_SIZES,
    resolutions: APIMART_GPT_25_RESOLUTIONS,
    widescreenOnly4k: false,
  },
}
export const APIMART_GPT_25_EXT_SUNBURST_MODEL: ProviderModel = {
  id: 'gpt-image-2.5-ext-sunburst',
  label: 'gpt-image-2.5-ext · Sunburst',
  extra: { model: 'gpt-image-2.5-ext', version: 'sunburst' },
  capabilities: {
    sizes: APIMART_GPT_25_EXT_SIZES,
    resolutions: APIMART_GPT_25_RESOLUTIONS,
    widescreenOnly4k: false,
  },
}

// Built-in API Mart model presets. New presets are appended to existing
// configs on startup so users get the latest models without touching Settings.
export const APIMART_MODEL_PRESETS: ProviderModel[] = [
  { id: 'gpt-image-2', label: 'gpt-image-2' },
  { id: 'gpt-image-2-official', label: 'gpt-image-2 · Official', extra: { official_fallback: true } },
  APIMART_GPT_25_FLARE_MODEL,
  APIMART_GPT_25_SUNBURST_MODEL,
  APIMART_GPT_25_EXT_FLARE_MODEL,
  APIMART_GPT_25_EXT_SUNBURST_MODEL,
]

// Presets applied to existing configs during migration. gpt-image-2 and the
// official row have shipped since v1.0 — leaving them out means a deliberately
// deleted entry is not resurrected, while new models (the 2.5 family) keep
// being ensured for installs that predate them.
const APIMART_UPGRADE_PRESETS = APIMART_MODEL_PRESETS.filter(
  m => m.id !== 'gpt-image-2' && m.id !== 'gpt-image-2-official',
)

function clonePreset(preset: ProviderModel): ProviderModel {
  return {
    ...preset,
    extra: preset.extra ? { ...preset.extra } : undefined,
    capabilities: preset.capabilities ? { ...preset.capabilities } : undefined,
    pricing: preset.pricing ? { ...preset.pricing } : undefined,
  }
}

// 内置预设模型补齐：缺的追加、已有的刷新 extra/capabilities/pricing（用户自己的值优先）。
// 老模型故意删除后不会再被复活 —— 只有 preset 列表里的新条目会被追加。
function ensureModelPresets(provider: ProviderConfig, presets: ProviderModel[], label: string): boolean {
  let changed = false
  for (const preset of presets) {
    const name = preset.label || preset.id
    const idx = provider.models.findIndex(m => m.id === preset.id)
    if (idx === -1) {
      provider.models.push(clonePreset(preset))
      changed = true
      console.log(`config.json migrated: ${label} ${name} preset appended`)
      continue
    }
    const existing = provider.models[idx]
    const next = {
      ...existing,
      extra: preset.extra ? { ...preset.extra, ...(existing.extra || {}) } : existing.extra,
      capabilities: preset.capabilities ? { ...preset.capabilities, ...(existing.capabilities || {}) } : existing.capabilities,
      pricing: preset.pricing ? { ...preset.pricing, ...(existing.pricing || {}) } : existing.pricing,
    }
    if (JSON.stringify(next) !== JSON.stringify(existing)) {
      provider.models[idx] = next
      changed = true
      console.log(`config.json migrated: ${label} ${name} capabilities refreshed`)
    }
  }
  return changed
}

// OpenRouter image model presets — snapshot of the free discovery API
// (GET /api/v1/images/models, 2026-07). A curated few ship enabled; the rest
// are opt-in via the Settings toggle. The adapter validates capabilities
// against the live discovery API at generation time, so a stale entry fails
// with a clear upstream error rather than a bad request.
export const OPENROUTER_MODEL_PRESETS: ProviderModel[] = [
  // Curated defaults
  { id: 'openai/gpt-image-2', label: 'gpt-image-2' },
  { id: 'openai/gpt-image-1', label: 'gpt-image-1' },
  { id: 'google/gemini-3.1-flash-image', label: 'gemini-3.1-flash-image' },
  { id: 'google/gemini-2.5-flash-image', label: 'gemini-2.5-flash-image' },
  // Opt-in
  { id: 'openai/gpt-image-1-mini', label: 'gpt-image-1-mini', enabled: false },
  { id: 'openai/gpt-5.4-image-2', label: 'gpt-5.4-image-2', enabled: false },
  { id: 'openai/gpt-5-image', label: 'gpt-5-image', enabled: false },
  { id: 'openai/gpt-5-image-mini', label: 'gpt-5-image-mini', enabled: false },
  { id: 'google/gemini-3.1-flash-image-preview', label: 'gemini-3.1-flash-image-preview', enabled: false },
  { id: 'google/gemini-3.1-flash-lite-image', label: 'gemini-3.1-flash-lite-image', enabled: false },
  { id: 'google/gemini-3-pro-image', label: 'gemini-3-pro-image', enabled: false },
  { id: 'google/gemini-3-pro-image-preview', label: 'gemini-3-pro-image-preview', enabled: false },
  { id: 'bytedance-seed/seedream-4.5', label: 'seedream-4.5', enabled: false },
  { id: 'black-forest-labs/flux.2-pro', label: 'flux.2-pro', enabled: false },
  { id: 'black-forest-labs/flux.2-max', label: 'flux.2-max', enabled: false },
  { id: 'black-forest-labs/flux.2-flex', label: 'flux.2-flex', enabled: false },
  { id: 'black-forest-labs/flux.2-klein-4b', label: 'flux.2-klein-4b', enabled: false },
  { id: 'microsoft/mai-image-2.5-pro', label: 'mai-image-2.5-pro', enabled: false },
  { id: 'microsoft/mai-image-2.5', label: 'mai-image-2.5', enabled: false },
  { id: 'x-ai/grok-imagine-image-quality', label: 'grok-imagine-image-quality', enabled: false },
  { id: 'krea/krea-2-large', label: 'krea-2-large', enabled: false },
  { id: 'krea/krea-2-medium', label: 'krea-2-medium', enabled: false },
  { id: 'krea/krea-2-medium-turbo', label: 'krea-2-medium-turbo', enabled: false },
  { id: 'sourceful/riverflow-v2.5-pro', label: 'riverflow-v2.5-pro', enabled: false },
  { id: 'sourceful/riverflow-v2.5-fast', label: 'riverflow-v2.5-fast', enabled: false },
  { id: 'sourceful/riverflow-v2-pro', label: 'riverflow-v2-pro', enabled: false },
  { id: 'sourceful/riverflow-v2-fast', label: 'riverflow-v2-fast', enabled: false },
  { id: 'recraft/recraft-v4.1-pro', label: 'recraft-v4.1-pro', enabled: false },
  { id: 'recraft/recraft-v4.1', label: 'recraft-v4.1', enabled: false },
  { id: 'recraft/recraft-v4.1-pro-vector', label: 'recraft-v4.1-pro-vector', enabled: false },
  { id: 'recraft/recraft-v4.1-vector', label: 'recraft-v4.1-vector', enabled: false },
  { id: 'recraft/recraft-v4.1-utility-pro', label: 'recraft-v4.1-utility-pro', enabled: false },
  { id: 'recraft/recraft-v4.1-utility', label: 'recraft-v4.1-utility', enabled: false },
  { id: 'recraft/recraft-v4-pro', label: 'recraft-v4-pro', enabled: false },
  { id: 'recraft/recraft-v4', label: 'recraft-v4', enabled: false },
  { id: 'recraft/recraft-v4-pro-vector', label: 'recraft-v4-pro-vector', enabled: false },
  { id: 'recraft/recraft-v4-vector', label: 'recraft-v4-vector', enabled: false },
  { id: 'recraft/recraft-v3', label: 'recraft-v3', enabled: false },
]

// AIHubMix 内置预设 —— 走 OpenAI 兼容的 /v1/images/generations（响应 {data:[{url}]}）。
// Qwen image 系直接吃 {width}x{height}：实测区间 262144~6553600 像素内的尺寸都被原样执行，
// 所以这里给的是像素尺寸而不是画面比例，前端据此隐藏 1K/2K/4K 档位。
// pricing.perImage 是模型页标价（USD/张），服务端按它把成本写进图片元数据。
const AIHUBMIX_QWEN_SIZES = [
  'auto', '1024x1024', '1536x1024', '1024x1536', '2048x2048',
  '1024x576', '576x1024', '768x1024', '768x512', '512x1024',
]

export const AIHUBMIX_MODEL_PRESETS: ProviderModel[] = [
  {
    id: 'qwen-image-2.1-turbo',
    label: 'qwen-image-2.1-turbo',
    capabilities: { sizes: AIHUBMIX_QWEN_SIZES, defaultSize: '1024x1024' },
    pricing: { perImage: 0.0141, currency: 'USD' },
  },
  {
    id: 'qwen-image-2.1-pro',
    label: 'qwen-image-2.1-pro',
    enabled: false,
    capabilities: { sizes: AIHUBMIX_QWEN_SIZES, defaultSize: '1024x1024' },
    pricing: { perImage: 0.0352, currency: 'USD' },
  },
]

let configFile = ''
let appConfig: AppConfig = {
  providers: [],
  aiChat: { apiKey: '', baseUrl: DEFAULT_OPENAI_BASE_URL, model: 'gpt-4o-mini' },
  promptSnippets: [],
  optimizers: [],
}

export function getConfig(): AppConfig {
  return appConfig
}

// 开箱即用的优化器预设：只有一条，用户可以照着再建几条（人像收敛、海报排版……），
// 但每次发送只会用被选中的那一条。
function defaultOptimizers(): OptimizerPreset[] {
  return [
    {
      id: 'optimizer_default',
      name: '通用优化',
      prompt: DEFAULT_OPTIMIZER_PROMPT,
    },
  ]
}

function defaultProviders(): ProviderConfig[] {
  return [
    {
      id: 'apimart',
      name: 'API Mart',
      type: 'apimart-task',
      enabled: true,
      apiKey: process.env.APIMART_API_KEY || '',
      baseUrl: process.env.APIMART_BASE_URL || DEFAULT_APIMART_BASE_URL,
      models: APIMART_MODEL_PRESETS.map(clonePreset),
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      type: 'openrouter-images',
      enabled: true,
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL,
      models: OPENROUTER_MODEL_PRESETS.map(m => ({ ...m })),
    },
    {
      id: 'aihubmix',
      name: 'AIHubMix',
      type: 'openai-images',
      enabled: false,
      apiKey: process.env.AIHUBMIX_API_KEY || '',
      baseUrl: process.env.AIHUBMIX_BASE_URL || DEFAULT_AIHUBMIX_BASE_URL,
      models: AIHUBMIX_MODEL_PRESETS.map(clonePreset),
    },
    {
      id: 'openai',
      name: 'OpenAI',
      type: 'openai-images',
      enabled: false,
      apiKey: '',
      baseUrl: DEFAULT_OPENAI_BASE_URL,
      models: [{ id: 'gpt-image-1', label: 'gpt-image-1' }],
    },
  ]
}

export async function initConfig(dataDir: string): Promise<AppConfig> {
  configFile = path.join(dataDir, 'config.json')
  console.log(`[config] configFile: ${configFile}`)
  appConfig = {
    providers: defaultProviders(),
    aiChat: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
      model: 'gpt-4o-mini',
    },
    promptSnippets: [],
    optimizers: defaultOptimizers(),
  }

  let saved: any = null
  try {
    // Strip a possible BOM — some editors write UTF-8 with one and JSON.parse rejects it
    const raw = await fs.readFile(configFile, 'utf-8')
    saved = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw)
    console.log(`[config] loaded existing config.json — ${saved.providers?.length || 0} providers`)
  } catch {
    console.log('[config] no config.json yet, using defaults')
  }

  if (saved) {
    if (Array.isArray(saved.providers)) {
      // Current schema
      appConfig.providers = saved.providers
      // The built-in OpenRouter provider moved from the OpenAI-compatible
      // adapter to OpenRouter's dedicated Image API (POST /images) — re-point
      // saved configs, which would otherwise keep hitting the old endpoint
      let migrated = false
      for (const p of appConfig.providers) {
        if (p?.id !== 'openrouter') continue
        if (p.type !== 'openrouter-images') {
          p.type = 'openrouter-images'
          migrated = true
        }
        // Ship the full image-model preset list to existing installs: any
        // preset the user doesn't have yet is appended disabled (opt-in).
        // Once any model carries an explicit enabled flag the list is
        // considered user-managed and is never merged again — this keeps
        // later deletions from being resurrected on the next start.
        const models: ProviderModel[] = Array.isArray(p.models) ? p.models : []
        if (!models.some(m => m.enabled !== undefined)) {
          const known = new Set(models.map(m => m.id))
          const missing = OPENROUTER_MODEL_PRESETS.filter(m => !known.has(m.id))
          if (missing.length) {
            p.models = [...models, ...missing.map(m => ({ ...m }))]
            migrated = true
            console.log(`config.json migrated: ${missing.length} OpenRouter model presets appended (disabled)`)
          }
        }
      }
      if (saved.aiChat) {
        // 只取这三项：老配置里可能还留着 aiChat.optimizerPrompt，这里不迁移，
        // 下次写盘时自然消失（优化器已经改成独立的预设列表）。
        appConfig.aiChat = {
          apiKey: typeof saved.aiChat.apiKey === 'string' ? saved.aiChat.apiKey : appConfig.aiChat.apiKey,
          baseUrl: typeof saved.aiChat.baseUrl === 'string' ? saved.aiChat.baseUrl : appConfig.aiChat.baseUrl,
          model: typeof saved.aiChat.model === 'string' ? saved.aiChat.model : appConfig.aiChat.model,
        }
      }
      const apimart = appConfig.providers.find(p => p.id === 'apimart')
      if (apimart && ensureModelPresets(apimart, APIMART_UPGRADE_PRESETS, 'API Mart')) {
        migrated = true
      }
      // AIHubMix 之前是用户手加的自定义供应商 —— 收到内置条目下（保留 key/enabled，
      // 只把 custom 关掉，并把缺的预设模型/价格补齐）
      const aihubmix = appConfig.providers.find(p => p.id === 'aihubmix')
      if (aihubmix) {
        if (aihubmix.custom) {
          aihubmix.custom = false
          migrated = true
          console.log('config.json migrated: AIHubMix is now a built-in provider')
        }
        if (ensureModelPresets(aihubmix, AIHUBMIX_MODEL_PRESETS, 'AIHubMix')) {
          migrated = true
        }
      }
      // Older configs have no promptSnippets — keep the empty default.
      // Empty-prompt items are kept: a freshly created snippet is blank until edited
      if (Array.isArray(saved.promptSnippets)) {
        appConfig.promptSnippets = (saved.promptSnippets as any[]).map(sanitizeSnippet).filter((s: PromptSnippet) => s.id)
      }
      // 优化器预设：老配置没有这个数组就落一份默认预设；用户删光则保持空（不复活）
      if (Array.isArray(saved.optimizers)) {
        appConfig.optimizers = (saved.optimizers as any[]).map(sanitizeOptimizer).filter((o: OptimizerPreset) => o.id)
      } else {
        migrated = true
        console.log('config.json migrated: optimizers seeded with the default preset')
      }
      if (migrated) {
        await persistConfig()
        console.log('config.json migrated: openrouter provider now uses the OpenRouter Image API')
      }
    } else {
      // Legacy flat schema (apimartApiKey/apimartBaseUrl/openaiApiKey/openaiBaseUrl)
      // — migrate into the providers[] + aiChat structure and write back
      const apimart = appConfig.providers.find(p => p.id === 'apimart')!
      if (saved.apimartApiKey) apimart.apiKey = String(saved.apimartApiKey)
      if (saved.apimartBaseUrl) apimart.baseUrl = String(saved.apimartBaseUrl)
      if (saved.openaiApiKey) appConfig.aiChat.apiKey = String(saved.openaiApiKey)
      if (saved.openaiBaseUrl) appConfig.aiChat.baseUrl = String(saved.openaiBaseUrl)
      await persistConfig()
      console.log('config.json migrated to the providers schema')
    }
  }
  return appConfig
}

async function persistConfig(): Promise<void> {
  await fs.mkdir(path.dirname(configFile), { recursive: true })
  await fs.writeFile(configFile, JSON.stringify(appConfig, null, 2))
  console.log(`[config] saved to ${configFile}`)
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  if (Array.isArray(patch.providers)) {
    appConfig.providers = patch.providers.map(sanitizeProvider).filter(p => p.id)
  }
  if (patch.aiChat) {
    appConfig.aiChat = {
      apiKey: typeof patch.aiChat.apiKey === 'string' ? patch.aiChat.apiKey.trim() : appConfig.aiChat.apiKey,
      baseUrl: normalizeBaseUrl(patch.aiChat.baseUrl, DEFAULT_OPENAI_BASE_URL),
      model: typeof patch.aiChat.model === 'string' ? patch.aiChat.model.trim() || 'gpt-4o-mini' : appConfig.aiChat.model,
    }
  }
  if (Array.isArray(patch.promptSnippets)) {
    appConfig.promptSnippets = patch.promptSnippets.map(sanitizeSnippet).filter(s => s.id)
  }
  if (Array.isArray(patch.optimizers)) {
    appConfig.optimizers = patch.optimizers.map(sanitizeOptimizer).filter(o => o.id)
  }
  await persistConfig()
  return appConfig
}

function sanitizeOptimizer(o: any): OptimizerPreset {
  return {
    id: String(o?.id || '').slice(0, 64),
    name: String(o?.name || '').trim().slice(0, 64),
    prompt: typeof o?.prompt === 'string' ? o.prompt.slice(0, 8000) : '',
  }
}

function sanitizeSnippet(s: any): PromptSnippet {
  return {
    id: String(s?.id || '').slice(0, 64),
    title: String(s?.title || '').trim().slice(0, 64),
    prompt: typeof s?.prompt === 'string' ? s.prompt.slice(0, 4000) : '',
  }
}

function normalizeBaseUrl(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/\/+$/, '') || fallback
}

function sanitizeProvider(p: any): ProviderConfig {
  // Whitelist derives from the adapter registry — a type registered there can
  // never be silently coerced here
  const type: ProviderConfig['type'] = isKnownProviderType(p?.type) ? p.type : FALLBACK_PROVIDER_TYPE
  const fallbackBaseUrl = type === 'apimart-task' ? DEFAULT_APIMART_BASE_URL : DEFAULT_OPENAI_BASE_URL
  return {
    id: String(p?.id || '').slice(0, 64),
    name: String(p?.name || p?.id || '').slice(0, 64),
    type,
    enabled: !!p?.enabled,
    apiKey: typeof p?.apiKey === 'string' ? p.apiKey.trim() : '',
    baseUrl: normalizeBaseUrl(p?.baseUrl, fallbackBaseUrl),
    custom: !!p?.custom,
    ...(Number(p?.timeoutMs) > 0 ? { timeoutMs: Number(p.timeoutMs) } : {}),
    ...(p?.resetQueueOnStart === true ? { resetQueueOnStart: true } : {}),
    models: Array.isArray(p?.models)
      ? p.models
          .map((m: any) => ({
            id: String(m?.id || '').trim(),
            label: String(m?.label || m?.id || '').trim(),
            // Absent means enabled; only an explicit false is persisted
            ...(m?.enabled === false ? { enabled: false } : {}),
            ...(m?.extra && typeof m.extra === 'object' ? { extra: m.extra } : {}),
            ...sanitizeModelCapabilities(m),
            ...sanitizeModelPricing(m),
          }))
          .filter((m: any) => m.id)
      : [],
  }
}

function sanitizeModelPricing(m: any): { pricing?: ProviderModel['pricing'] } {
  const p = m?.pricing
  if (!p || typeof p !== 'object') return {}
  const perImage = Number(p.perImage)
  if (!Number.isFinite(perImage) || perImage < 0) return {}
  const currency = typeof p.currency === 'string' ? p.currency.trim().toUpperCase().slice(0, 8) : ''
  return { pricing: { perImage, ...(currency ? { currency } : {}) } }
}

function sanitizeModelCapabilities(m: any): { capabilities?: ProviderModel['capabilities'] } {
  const c = m?.capabilities
  if (!c || typeof c !== 'object') return {}
  return {
    capabilities: {
      ...(Array.isArray(c.sizes) ? { sizes: c.sizes.map(String) } : {}),
      ...(typeof c.defaultSize === 'string' && c.defaultSize ? { defaultSize: c.defaultSize } : {}),
      ...(Array.isArray(c.resolutions) ? { resolutions: c.resolutions.map(String) } : {}),
      ...(typeof c.allowImageInput === 'boolean' ? { allowImageInput: c.allowImageInput } : {}),
      ...(typeof c.widescreenOnly4k === 'boolean' ? { widescreenOnly4k: c.widescreenOnly4k } : {}),
    },
  }
}
