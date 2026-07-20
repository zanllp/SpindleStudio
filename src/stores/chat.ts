import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { message } from 'ant-design-vue'
import type {
  Conversation,
  ConversationSummary,
  ChatMessage,
  ChatReferenceImage,
} from '@/types'
import api from '@/api'
import { useSettingsStore } from '@/stores/settings'

const CHAT_IMAGE_CATEGORY = 'chat'

function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// fetch 本地图片 URL 并转成 base64 data URL（API Mart 无法访问 localhost，必须内联）
async function urlToBase64DataUrl(url: string): Promise<string> {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`读取参考图失败: ${url}`)
  const blob = await resp.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('参考图转 base64 失败'))
    reader.readAsDataURL(blob)
  })
}

export const useChatStore = defineStore('chat', () => {
  const settingsStore = useSettingsStore()
  const conversationList = ref<ConversationSummary[]>([])
  const activeConversation = ref<Conversation | null>(null)
  const pendingReferenceImages = ref<ChatReferenceImage[]>([])
  const isLoadingList = ref(false)

  const activeConversationId = computed(() => activeConversation.value?.id || null)

  // 是否有参考图 → 决定文生图/图生图
  const isImg2Img = computed(() => pendingReferenceImages.value.length > 0)

  // 生图供应商/模型在 settings store 中选择（供应商列表 + 各供应商模型）

  // 生成参数
  const chatSize = ref('auto')
  const chatResolution = ref<'1k' | '2k' | '4k'>('1k')
  const chatCount = ref(1)

  // 当前是否有正在生成的消息
  const isGenerating = computed(() =>
    activeConversation.value?.messages.some(m => m.status === 'generating') || false
  )

  // 消息气泡"回填"→输入框的草稿（非持久，切换会话时清空）
  const draftPrompt = ref('')

  function setDraftPrompt(prompt: string, referenceImages?: ChatReferenceImage[]) {
    draftPrompt.value = prompt
    if (referenceImages && referenceImages.length > 0) {
      pendingReferenceImages.value = referenceImages.map(r => ({ ...r, id: genId('ref') }))
    }
  }

  // ==================== 持久化 ====================

  // 有本地变更（尚未通过 persistNow 落盘）的会话 id。
  // 多标签页打开同一会话时，未做任何修改的标签页持有旧内存状态，
  // 若切换会话时无条件整体覆盖写盘，会吃掉其他标签页已保存的新内容（曾因此丢失生成记录）
  const dirtyConvIds = new Set<string>()

  // 防抖保存：调度时快照当前会话，避免切换会话后串数据
  const persistDebounced = useDebounceFn(async (snapshot: Conversation) => {
    try {
      await api.saveConversation(snapshot.id, snapshot)
    } catch (e: any) {
      console.error('保存会话失败:', e.message)
    }
  }, 500)

  // 防抖落盘指定会话（深拷贝快照；生成回调触发时该会话未必是激活会话）
  function persistConvDebounced(conv: Conversation) {
    conv.updatedAt = Date.now()
    dirtyConvIds.add(conv.id)
    persistDebounced(JSON.parse(JSON.stringify(conv)))
  }

  // 立即落盘（切换/删除会话前调用）；只写确有本地变更的会话，空闲标签页不写
  async function persistNow() {
    const conv = activeConversation.value
    if (!conv || !dirtyConvIds.has(conv.id)) return
    conv.updatedAt = Date.now()
    dirtyConvIds.delete(conv.id)
    await api.saveConversation(conv.id, JSON.parse(JSON.stringify(conv)))
  }

  // ==================== 会话管理 ====================

  async function loadConversations() {
    isLoadingList.value = true
    try {
      const { conversations } = await api.getConversations()
      conversationList.value = conversations
    } finally {
      isLoadingList.value = false
    }
  }

  async function createNewConversation(title?: string): Promise<Conversation> {
    const conv = await api.createConversation(title)
    conversationList.value.unshift({
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
    })
    activeConversation.value = conv
    pendingReferenceImages.value = []
    return conv
  }

  async function selectConversation(id: string) {
    if (activeConversationId.value === id) return
    await persistNow()
    const conv = await api.getConversation(id)
    dirtyConvIds.delete(id) // 刚从磁盘加载，无本地变更
    activeConversation.value = conv
    pendingReferenceImages.value = []
    // 页面刷新/切换回来：恢复未完成任务的轮询
    // 注意必须传响应式代理（activeConversation.value），直接改原始对象不会触发界面更新
    resumePendingGenerations(activeConversation.value!)
  }

  async function renameConversation(id: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    if (activeConversationId.value === id && activeConversation.value) {
      activeConversation.value.title = trimmed
      dirtyConvIds.add(id)
      await persistNow()
    } else {
      const conv = await api.getConversation(id)
      conv.title = trimmed
      conv.updatedAt = Date.now()
      await api.saveConversation(id, conv)
    }
    const item = conversationList.value.find(c => c.id === id)
    if (item) item.title = trimmed
  }

  async function deleteConversation(id: string) {
    await api.deleteConversation(id)
    dirtyConvIds.delete(id)
    conversationList.value = conversationList.value.filter(c => c.id !== id)
    if (activeConversationId.value === id) {
      activeConversation.value = null
      pendingReferenceImages.value = []
    }
  }

  // ==================== 参考图 ====================

  function addPendingReference(image: { url: string; filename: string }) {
    if (pendingReferenceImages.value.some(r => r.url === image.url)) return
    pendingReferenceImages.value.push({
      id: genId('ref'),
      source: image.url.startsWith('/uploads/') ? 'upload' : 'generated',
      url: image.url,
      relativePath: image.url.replace(/^\/(images|uploads)\//, ''),
    })
  }

  async function addPendingUpload(file: File) {
    if (!activeConversation.value) {
      await createNewConversation()
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(file)
    })
    const result = await api.uploadConversationImage(activeConversation.value!.id, file.name, dataUrl)
    pendingReferenceImages.value.push({
      id: genId('ref'),
      source: 'upload',
      url: result.url,
      relativePath: result.relativePath,
    })
  }

  function removePendingReference(id: string) {
    pendingReferenceImages.value = pendingReferenceImages.value.filter(r => r.id !== id)
  }

  // 手动触发 AI 总结标题（重命名弹窗）：只提交用户消息，去重后让 AI 概括。
  // 只返回标题文本，不写会话不落盘 —— 由调用方决定直接采用还是放进输入框再编辑
  async function summarizeTitle(id: string): Promise<string> {
    // 激活会话直接用内存数据，其他会话从磁盘读
    const conv = activeConversationId.value === id && activeConversation.value
      ? activeConversation.value
      : await api.getConversation(id)
    // 用户常重复发同一提示词生成变体，去重后再提交（保序）
    const userPrompts = [...new Set(
      conv.messages
        .filter(m => m.role === 'user')
        .map(m => m.prompt.trim())
        .filter(Boolean)
    )]
      .slice(0, 5)
      .map(p => p.slice(0, 500))
    if (userPrompts.length === 0) throw new Error('会话还没有用户消息，无法总结')
    return api.summarizeConversationTitle(userPrompts)
  }

  // ==================== 发送消息与生成 ====================

  async function sendMessage(prompt: string) {
    const trimmed = prompt.trim()
    // 不等待上一条完成，允许多条并发生成
    if (!trimmed) return

    const { provider, model } = settingsStore.effectiveSelection
    if (!provider || !model) {
      message.error('请先在设置中配置并启用一个生图供应商')
      settingsStore.settingsOpen = true
      return
    }

    if (!activeConversation.value) {
      await createNewConversation()
    }
    const conv = activeConversation.value!

    const now = Date.now()
    const count = chatCount.value

    const userMessage: ChatMessage = {
      id: genId('msg'),
      role: 'user',
      prompt: trimmed,
      referenceImages: [...pendingReferenceImages.value],
      generatedImages: [],
      status: 'done',
      provider: provider.id,
      model: model.id,
      createdAt: now,
    }

    const assistantMessage: ChatMessage = {
      id: genId('msg'),
      role: 'assistant',
      prompt: trimmed,
      referenceImages: [],
      generatedImages: [],
      status: 'generating',
      provider: provider.id,
      model: model.id,
      count,
      createdAt: now,
    }

    conv.messages.push(userMessage, assistantMessage)
    pendingReferenceImages.value = []

    // 关键：push 的是原始对象，后续必须通过响应式代理引用消息，
    // 否则生成回调里对 图片/状态/taskIds 的变更不触发界面更新（表现为"必须刷新才显示"）
    const reactiveUserMessage = conv.messages[conv.messages.length - 2]
    const reactiveAssistantMessage = conv.messages[conv.messages.length - 1]

    // 记录上传参考图的使用次数（用于上传历史按频率排序）
    userMessage.referenceImages
      .filter(r => r.source === 'upload')
      .forEach(r => api.recordUploadUsage(r.relativePath).catch(() => {}))

    // 首条消息自动命名（截断兜底；AI 总结为重命名弹窗里的手动操作）
    if (conv.title === '新对话') {
      conv.title = trimmed.slice(0, 20)
      const item = conversationList.value.find(c => c.id === conv.id)
      if (item) item.title = conv.title
    }

    persistConvDebounced(conv)
    await generateForMessage(conv, reactiveUserMessage, reactiveAssistantMessage)
  }

  // 提交生成任务：每张图一个独立请求（普通渠道 n 仅支持 1，拆请求后行为一致），返回 task_id 数组
  async function submitGenerations(userMessage: ChatMessage, count: number): Promise<string[]> {
    const { provider, model } = settingsStore.effectiveSelection
    if (!provider || !model) throw new Error('未配置生图供应商，请先在设置中填写 API Key')
    // 参考图转 base64 内联（上游服务无法访问 localhost，必须内联；只需转一次，各请求共用）
    const imageUrls = await Promise.all(userMessage.referenceImages.map(r => urlToBase64DataUrl(r.url)))
    // 与工作台图生图面板一致：auto 比例 + 图生图时分辨率降级 1k
    const finalResolution = imageUrls.length > 0 && chatSize.value === 'auto' ? '1k' : chatResolution.value
    const submitOne = () =>
      api.generateSubmit({
        providerId: provider.id,
        modelId: model.id,
        prompt: userMessage.prompt,
        n: 1,
        size: chatSize.value,
        resolution: finalResolution,
        imageCategory: CHAT_IMAGE_CATEGORY,
        ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
      }).then(r => r.task_id)
    return Promise.all(Array.from({ length: count }, submitOne))
  }

  // 轮询任务直到完成（skipInitialWait 用于刷新后恢复的场景，任务已运行一段时间）
  async function pollTaskResult(taskId: string, skipInitialWait = false): Promise<{ images: Array<{ url: string; filename: string; image_base64?: string }>; metadata?: any }> {
    const maxPolls = 180
    const pollInterval = 3000
    let consecutiveErrors = 0
    if (!skipInitialWait) {
      await new Promise(resolve => setTimeout(resolve, 15000))
    }
    for (let i = 0; i < maxPolls; i++) {
      let pollResult: any
      try {
        pollResult = await api.generateTaskStatus(taskId)
        consecutiveErrors = 0
      } catch (e: any) {
        // 连续失败说明网络/服务端异常，不再无限重试
        consecutiveErrors++
        if (consecutiveErrors >= 10) {
          throw new Error(`轮询连续失败 ${consecutiveErrors} 次: ${e.message || '网络异常'}`)
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval))
        continue
      }
      if (pollResult.status === 'completed') {
        // 服务端逐张保存后返回 results 数组（兼容旧响应：无 results 时取顶层字段）
        const images = pollResult.results || [
          { url: pollResult.url, filename: pollResult.filename, image_base64: pollResult.image_base64 },
        ]
        return { images, metadata: pollResult.metadata }
      }
      if (pollResult.status === 'failed') {
        throw new Error(pollResult.error || '生成任务失败')
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }
    throw new Error('生成超时')
  }

  interface GenerationResult {
    images: Array<{ url: string; filename: string; image_base64?: string }>
    metadata?: any
  }

  // 并发轮询多个任务；每个任务一完成（成功或失败）立即回调，返回所有失败原因
  // 回调里应把该任务从消息 taskIds 中移除并落盘，保证刷新后续跑不会重复追加
  async function pollAllTasks(
    taskIds: string[],
    skipInitialWait: boolean,
    onTaskSettled: (taskId: string, result: GenerationResult | null, error: string | null) => void,
  ): Promise<string[]> {
    const errors = await Promise.all(taskIds.map(async (id) => {
      try {
        const result = await pollTaskResult(id, skipInitialWait)
        onTaskSettled(id, result, null)
        return null
      } catch (e: any) {
        const msg = e?.message || '生成失败'
        onTaskSettled(id, null, msg)
        return msg
      }
    }))
    return errors.filter((e): e is string => !!e)
  }

  // 轮询一组任务并渐进更新消息：每张图一完成立即上屏 + 落盘，失败数也实时累计；
  // 全部结束后定型状态（有图则 done，无图抛错进 catch）
  async function runGenerationTasks(
    conv: Conversation,
    userMessage: ChatMessage,
    assistantMessage: ChatMessage,
    taskIds: string[],
    skipInitialWait: boolean,
    startTime: number,
  ) {
    const count = assistantMessage.count || taskIds.length
    const errors = await pollAllTasks(taskIds, skipInitialWait, (taskId, result, error) => {
      // 已了结的任务从待轮询列表移除：刷新后只续跑未完成任务，不会重复追加图片
      assistantMessage.taskIds = (assistantMessage.taskIds || []).filter(id => id !== taskId)
      if (error) {
        assistantMessage.failedCount = (assistantMessage.failedCount || 0) + 1
        assistantMessage.partialError = `${assistantMessage.failedCount}/${count} 张生成失败：${error}`
      } else if (result && result.images.length > 0) {
        const generationTime = (Date.now() - startTime) / 1000
        for (const img of result.images) {
          assistantMessage.generatedImages.push({
            id: genId('img'),
            url: img.url,
            filename: img.filename,
            prompt: userMessage.prompt,
            provider: assistantMessage.provider,
            model: assistantMessage.model,
            generationTime,
            metadata: result.metadata,
          })
        }
      }
      persistConvDebounced(conv)
    })

    if (assistantMessage.generatedImages.length === 0) {
      // 追加生成可能让另一组任务同时在跑：还有未了结任务时交给那组收尾
      if ((assistantMessage.taskIds || []).length > 0) return
      throw new Error(errors[0] || '生成失败')
    }
    // 同上：仍有在途任务时不定型，由最后一组统一结算状态
    if ((assistantMessage.taskIds || []).length > 0) return
    assistantMessage.status = 'done'
    assistantMessage.taskIds = undefined
    assistantMessage.taskId = undefined
    // partialError 已在回调里逐次更新；跨刷新续跑时失败原因可能丢失，这里用最终计数兜底
    if (assistantMessage.failedCount) {
      assistantMessage.partialError = `${assistantMessage.failedCount}/${count} 张生成失败${errors[0] ? `：${errors[0]}` : ''}`
      assistantMessage.failedCount = undefined
    }
  }

  async function generateForMessage(conv: Conversation, userMessage: ChatMessage, assistantMessage: ChatMessage) {
    const startTime = Date.now()
    const count = assistantMessage.count || 1
    try {
      // 记录本次实际使用的供应商/模型（重试/再生成可能发生在切换选择之后）
      const { provider, model } = settingsStore.effectiveSelection
      if (!provider || !model) throw new Error('未配置生图供应商，请先在设置中填写 API Key')
      assistantMessage.provider = provider.id
      assistantMessage.model = model.id
      assistantMessage.taskId = undefined
      assistantMessage.taskIds = undefined
      assistantMessage.partialError = undefined
      assistantMessage.failedCount = undefined
      assistantMessage.generatedImages = []
      const taskIds = await submitGenerations(userMessage, count)
      // 先落盘 task_id：此时刷新页面也能恢复轮询
      assistantMessage.taskIds = taskIds
      persistConvDebounced(conv)
      await runGenerationTasks(conv, userMessage, assistantMessage, taskIds, false, startTime)
    } catch (error: any) {
      assistantMessage.status = 'error'
      assistantMessage.taskIds = undefined
      assistantMessage.taskId = undefined
      assistantMessage.error = error.response?.data?.error || error.message || '生成失败'
    } finally {
      persistConvDebounced(conv)
    }
  }

  // 本页面会话中已恢复过轮询的消息，避免重复选择会话时叠加多个轮询循环
  const resumedMessageIds = new Set<string>()

  // 恢复会话中所有生成中消息的轮询（页面刷新/切换回来后调用）
  function resumePendingGenerations(conv: Conversation) {
    let dirty = false
    for (let i = 0; i < conv.messages.length; i++) {
      const msg = conv.messages[i]
      if (msg.role !== 'assistant' || msg.status !== 'generating') continue
      const userMessage = conv.messages[i - 1]
      // 新字段 taskIds 优先，兼容旧数据的单 taskId
      const taskIds = msg.taskIds?.length ? msg.taskIds : (msg.taskId ? [msg.taskId] : [])
      if (taskIds.length === 0 || !userMessage || userMessage.role !== 'user') {
        // 无 task_id 的老数据无法恢复，保持原行为
        msg.status = 'error'
        msg.error = '生成被中断（页面刷新）'
        dirty = true
        continue
      }
      if (resumedMessageIds.has(msg.id)) continue
      resumedMessageIds.add(msg.id)
      resumeTaskPolling(conv, userMessage, msg, taskIds)
    }
    if (dirty) persistConvDebounced(conv)
  }

  async function resumeTaskPolling(conv: Conversation, userMessage: ChatMessage, assistantMessage: ChatMessage, taskIds: string[]) {
    try {
      // 耗时从消息创建时间起算（近似值）
      await runGenerationTasks(conv, userMessage, assistantMessage, taskIds, true, assistantMessage.createdAt)
    } catch (error: any) {
      assistantMessage.status = 'error'
      assistantMessage.taskIds = undefined
      assistantMessage.taskId = undefined
      assistantMessage.error = error.response?.data?.error || error.message || '生成失败'
    } finally {
      persistConvDebounced(conv)
    }
  }

  // 重试失败的消息
  async function retryMessage(assistantMessageId: string) {
    const conv = activeConversation.value
    if (!conv) return
    const idx = conv.messages.findIndex(m => m.id === assistantMessageId)
    if (idx <= 0) return
    const assistantMessage = conv.messages[idx]
    const userMessage = conv.messages[idx - 1]
    if (assistantMessage.role !== 'assistant' || userMessage.role !== 'user') return
    if (assistantMessage.status === 'generating') return

    assistantMessage.status = 'generating'
    assistantMessage.error = undefined
    persistConvDebounced(conv)
    await generateForMessage(conv, userMessage, assistantMessage)
  }

  // 在消息上追加生成一张图片（图片网格末尾的 + 按钮）：复用同一提示词与参考图。
  // 生成中也可追加：新任务并入 taskIds 一并轮询（不能覆盖，否则刷新后原任务丢失），
  // count +1 骨架自然多一个；失败时按是否在途分别回滚，不影响已有图片与原任务
  async function generateOneMore(assistantMessageId: string) {
    const conv = activeConversation.value
    if (!conv) return
    const idx = conv.messages.findIndex(m => m.id === assistantMessageId)
    if (idx <= 0) return
    // 注意必须取 conv.messages 里的响应式代理，直接改原始对象不会触发界面更新
    const assistantMessage = conv.messages[idx]
    const userMessage = conv.messages[idx - 1]
    if (assistantMessage.role !== 'assistant' || userMessage.role !== 'user') return
    if (assistantMessage.status !== 'done' && assistantMessage.status !== 'generating') return

    const startTime = Date.now()
    const alreadyGenerating = assistantMessage.status === 'generating'
    // 生成中追加在现有 count 上 +1（保住原有骨架）；完成后追加以实际图片数为基线
    const base = alreadyGenerating
      ? (assistantMessage.count || assistantMessage.generatedImages.length)
      : assistantMessage.generatedImages.length
    assistantMessage.count = base + 1
    if (!alreadyGenerating) {
      // 生成中的失败计数/提示属于在途任务，不能清，否则最终结算会漏算
      assistantMessage.partialError = undefined
      assistantMessage.failedCount = undefined
    }
    assistantMessage.status = 'generating'
    try {
      const taskIds = await submitGenerations(userMessage, 1)
      // 并入待轮询列表（原任务 id 必须保留），先落盘再轮询
      assistantMessage.taskIds = [...(assistantMessage.taskIds || []), ...taskIds]
      persistConvDebounced(conv)
      await runGenerationTasks(conv, userMessage, assistantMessage, taskIds, false, startTime)
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || '生成失败'
      if ((assistantMessage.taskIds || []).length > 0) {
        // 原任务仍在生成（多为提交失败）：仅回退本次追加的计数
        assistantMessage.count = Math.max((assistantMessage.count || 1) - 1, 1)
        assistantMessage.partialError = `追加生成失败：${msg}`
      } else if (assistantMessage.generatedImages.length > 0) {
        // 追加失败：回滚到 done，已有图片不受影响，仅提示本次失败
        assistantMessage.status = 'done'
        assistantMessage.count = assistantMessage.generatedImages.length
        assistantMessage.taskIds = undefined
        assistantMessage.taskId = undefined
        assistantMessage.partialError = `追加生成失败：${msg}`
      } else {
        assistantMessage.status = 'error'
        assistantMessage.taskIds = undefined
        assistantMessage.taskId = undefined
        assistantMessage.error = msg
      }
    } finally {
      persistConvDebounced(conv)
    }
  }

  // 删除一条用户消息及其对应的 assistant 消息。
  // 生成中也允许删除：在途轮询只持有已从列表移除的消息对象，回调里改状态/落盘都不会把消息加回来
  function deleteMessage(userMessageId: string) {
    const conv = activeConversation.value
    if (!conv) return
    const idx = conv.messages.findIndex(m => m.id === userMessageId)
    if (idx < 0 || conv.messages[idx].role !== 'user') return
    // 成对删除：user 后面紧跟的 assistant 一并清掉
    const removeCount = conv.messages[idx + 1]?.role === 'assistant' ? 2 : 1
    conv.messages.splice(idx, removeCount)
    resumedMessageIds.delete(userMessageId)
    persistConvDebounced(conv)
  }

  // 原地编辑用户消息并重新发送，覆盖对应的 assistant 消息
  async function editAndResend(userMessageId: string, newPrompt: string) {
    const conv = activeConversation.value
    const trimmed = newPrompt.trim()
    if (!conv || !trimmed) return
    const idx = conv.messages.findIndex(m => m.id === userMessageId)
    if (idx < 0 || idx >= conv.messages.length - 1) return
    const userMessage = conv.messages[idx]
    const assistantMessage = conv.messages[idx + 1]
    if (userMessage.role !== 'user' || assistantMessage.role !== 'assistant') return
    if (assistantMessage.status === 'generating') return

    userMessage.prompt = trimmed
    assistantMessage.prompt = trimmed
    assistantMessage.status = 'generating'
    assistantMessage.error = undefined
    assistantMessage.generatedImages = []
    assistantMessage.count = chatCount.value
    persistConvDebounced(conv)
    await generateForMessage(conv, userMessage, assistantMessage)
  }

  return {
    conversationList,
    activeConversation,
    activeConversationId,
    pendingReferenceImages,
    isLoadingList,
    isImg2Img,
    chatSize,
    chatResolution,
    chatCount,
    isGenerating,
    loadConversations,
    createNewConversation,
    selectConversation,
    renameConversation,
    deleteConversation,
    summarizeTitle,
    draftPrompt,
    setDraftPrompt,
    addPendingReference,
    addPendingUpload,
    removePendingReference,
    sendMessage,
    retryMessage,
    deleteMessage,
    editAndResend,
    generateOneMore,
  }
})
