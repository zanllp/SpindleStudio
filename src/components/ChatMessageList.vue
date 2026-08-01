<template>
  <div ref="listRef" class="chat-message-list" @scroll.passive="handleScroll">
    <!-- 生成队列开关：sticky 悬浮在列表可视区右上角 -->
    <div class="queue-toggle-anchor">
      <button
        class="queue-toggle-btn"
        :class="{ active: chatStore.queueOpen, blink: queueBtnBlink }"
        :data-tip="$t('chat.queue.toggleTooltip')"
        data-tip-placement="left"
        @click="chatStore.queueOpen = !chatStore.queueOpen"
      >
        <UnorderedListOutlined />
        <span v-if="queueGeneratingCount > 0" class="queue-badge">{{ queueGeneratingCount }}</span>
      </button>
    </div>

    <div class="messages-column">
      <div v-if="!chatStore.activeConversation" class="empty-state">
        <PictureOutlined class="empty-icon" />
        <p>{{ $t('chat.message.emptyNoConversation') }}</p>
        <p class="empty-sub">{{ $t('chat.message.emptySub') }}</p>
      </div>

      <template v-else>
        <div v-if="chatStore.activeConversation.messages.length === 0" class="empty-state">
          <PictureOutlined class="empty-icon" />
          <p>{{ $t('chat.message.emptyNoMessages') }}</p>
        </div>

        <div
          v-for="msg in chatStore.activeConversation.messages"
          :key="msg.id"
          :id="`msg-${msg.id}`"
          :ref="(el) => setRowRef(el as Element | null, msg.id)"
          :data-msg-id="msg.id"
          class="message-row"
          :class="msg.role"
        >
          <!-- 用户消息：提示词 + 参考图，支持原地编辑重发 -->
          <div v-if="msg.role === 'user'" class="user-wrap">
            <div class="bubble user-bubble" :class="{ editing: editingId === msg.id }">
              <template v-if="editingId === msg.id">
                <a-textarea
                  v-model:value="editingText"
                  :bordered="false"
                  :auto-size="{ minRows: 3, maxRows: 16 }"
                  :placeholder="$t('chat.message.editPlaceholder')"
                  @pressEnter="handleEditEnter"
                />
                <div class="edit-actions">
                  <AppButton size="small" @click="cancelEdit">{{ $t('common.cancel') }}</AppButton>
                  <AppButton size="small" type="primary" @click="confirmEdit">{{ $t('chat.message.resend') }}</AppButton>
                </div>
              </template>
              <template v-else>
                <div v-if="msg.referenceImages.length > 0" class="ref-images">
                  <template v-for="ref in msg.referenceImages" :key="ref.id">
                    <img
                      v-if="!destroyedRows.has(msg.id)"
                      :src="thumbUrl(ref.url, 144)"
                      loading="lazy"
                      decoding="async"
                      class="ref-img"
                      @click="openPreview(ref.url)"
                    />
                    <div v-else class="ref-img img-placeholder" />
                  </template>
                </div>
                <div class="prompt-text">{{ msg.prompt }}</div>
              </template>
            </div>
            <div v-if="editingId !== msg.id" class="msg-actions">
              <button class="icon-btn" :data-tip="$t('chat.message.fillBack')" @click="chatStore.setDraftPrompt(msg.prompt, msg.referenceImages)">
                <RollbackOutlined />
              </button>
              <button class="icon-btn" :data-tip="$t('chat.message.copyPrompt')" @click="copyPrompt(msg.prompt)">
                <CopyOutlined />
              </button>
              <button class="icon-btn" :data-tip="$t('chat.message.saveSnippetTooltip')" @click="openSaveSnippet(msg)">
                <BookOutlined />
              </button>
              <button v-if="canEdit(msg)" class="icon-btn" :data-tip="$t('chat.message.editTooltip')" @click="startEdit(msg)">
                <EditOutlined />
              </button>
              <button
                class="icon-btn delete-btn"
                :class="{ confirming: confirmingDeleteId === msg.id }"
                :data-tip="confirmingDeleteId === msg.id ? $t('chat.message.deleteConfirmAgain') : $t('common.delete')"
                data-tip-align="end"
                @click="handleDeleteClick(msg)"
              >
                <DeleteOutlined />
              </button>
            </div>
          </div>

          <!-- assistant 消息：生成结果（无气泡，内容平铺） -->
          <div v-else class="assistant-wrap">
            <!-- 部分失败提示（生成中随失败实时出现） -->
            <div v-if="msg.status !== 'error' && msg.partialError" class="partial-error">
              <WarningOutlined /> {{ msg.partialError }}
            </div>

            <!-- 已完成的图片（多张任务时生成中会逐张渐进出现） -->
            <div v-if="msg.generatedImages.length > 0" class="generated-images">
              <div
                v-for="img in msg.generatedImages"
                :key="img.id"
                class="generated-image-card"
                :class="{ single: msg.generatedImages.length === 1 }"
              >
                <img
                  v-if="!destroyedRows.has(msg.id)"
                  :src="thumbUrl(img.url, 480)"
                  loading="lazy"
                  decoding="async"
                  class="gen-img"
                  :alt="img.filename"
                  :style="genImgStyle(img)"
                  @load="recordImgDims(img.id, $event)"
                  @click="openPreview(img.url)"
                />
                <div v-else class="gen-img img-placeholder" :style="genImgStyle(img)" />
                <div class="img-overlay">
                  <button class="overlay-btn" :data-tip="$t('chat.message.referenceTooltip')" @click="handleReference(img)">
                    <LinkOutlined />
                  </button>
                  <button class="overlay-btn" :data-tip="$t('chat.message.paramsTooltip')" @click="openParams(img)">
                    <InfoCircleOutlined />
                  </button>
                  <a :href="img.url" :download="img.filename">
                    <button class="overlay-btn" :data-tip="$t('chat.message.downloadTooltip')">
                      <DownloadOutlined />
                    </button>
                  </a>
                </div>
                <span v-if="img.generationTime" class="gen-time">{{ img.generationTime.toFixed(1) }}s</span>
              </div>
              <!-- 追加生成一张：复用本消息的提示词与参考图，生成中也可点 -->
              <button
                v-if="msg.status === 'done' || msg.status === 'generating'"
                class="add-image-btn"
                :data-tip="$t('chat.message.generateOneMore')"
                @click="handleGenerateMore(msg)"
              >
                <PlusOutlined />
              </button>
            </div>

            <div v-if="msg.status === 'generating'" class="generating-card">
              <div v-if="remainingShimmerCount(msg) > 0" class="shimmer-row">
                <div v-for="i in remainingShimmerCount(msg)" :key="i" class="shimmer-block" />
              </div>
              <div class="generating-text">
                <LoadingOutlined />
                {{ generatingText(msg) }}
              </div>
            </div>

            <div v-else-if="msg.status === 'error'" class="error-box">
              <CloseCircleFilled class="error-icon" />
              <div class="error-content">
                <div class="error-title">{{ $t('chat.message.errorTitle') }}</div>
                <div class="error-desc">{{ msg.error }}</div>
              </div>
              <AppButton size="small" @click="chatStore.retryMessage(msg.id)">{{ $t('common.retry') }}</AppButton>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 回到底部按钮：sticky 悬浮在列表可视区底部，向上滚动一定距离后出现 -->
    <div class="scroll-bottom-anchor">
      <Transition name="fade">
        <button v-if="showScrollToBottom" class="scroll-bottom-btn" :data-tip="$t('chat.message.scrollToBottom')" @click="scrollToBottom">
          <ArrowDownOutlined />
        </button>
      </Transition>
    </div>

    <!-- 共享图片预览：列表里用懒加载小图，点击时预览层加载原图（预览层 portal 到 body，隐藏宿主不影响） -->
    <a-image
      :style="{ display: 'none' }"
      :preview="{
        visible: previewVisible,
        src: previewSrc,
        onVisibleChange: (v: boolean) => { previewVisible = v },
      }"
    />

    <!-- 生成参数模态框 -->
    <a-modal
      v-model:open="paramsVisible"
      :title="$t('chat.message.paramsModalTitle')"
      :footer="null"
      :width="720"
    >
      <div v-if="paramsImage">
        <img :src="paramsImage.url" style="width: 100%; border-radius: 10px;" />
        <a-descriptions :column="2" bordered size="small" style="margin-top: 16px;">
          <a-descriptions-item :label="$t('chat.message.paramsLabels.prompt')" :span="2">
            <div style="display: flex; align-items: flex-start; gap: 8px;">
              <span style="white-space: pre-wrap; word-break: break-word; flex: 1;">{{ paramsImage.prompt }}</span>
              <AppButton size="small" @click="copyPrompt(paramsImage.prompt)">
                <CopyOutlined />
              </AppButton>
            </div>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('chat.message.paramsLabels.model')">
            {{ paramsImage.metadata?.model || '-' }}
          </a-descriptions-item>
          <a-descriptions-item :label="$t('chat.message.paramsLabels.provider')">
            {{ paramsImage.metadata?.provider || paramsImage.provider || '-' }}
          </a-descriptions-item>
          <a-descriptions-item :label="$t('chat.message.paramsLabels.size')">
            {{ paramsImage.metadata?.size || '-' }}
          </a-descriptions-item>
          <a-descriptions-item :label="$t('chat.message.paramsLabels.aspectRatio')">
            {{ paramsImage.metadata?.aspect_ratio || '-' }}
          </a-descriptions-item>
          <a-descriptions-item :label="$t('chat.message.paramsLabels.resolution')">
            {{ paramsImage.metadata?.resolution || '-' }}
          </a-descriptions-item>
          <a-descriptions-item :label="$t('chat.message.paramsLabels.referenceImages')" :span="2">
            <span v-if="!paramsImage.metadata?.custom_metadata?.reference_images?.length">-</span>
            <div v-else style="display: flex; flex-wrap: wrap; gap: 8px;">
              <a-tag v-for="(ref, idx) in paramsImage.metadata.custom_metadata.reference_images" :key="idx" size="small">
                {{ ref }}
              </a-tag>
            </div>
          </a-descriptions-item>
          <a-descriptions-item :label="$t('chat.message.paramsLabels.source')">
            {{ providerLabel(paramsImage.provider, paramsImage.model) }}
          </a-descriptions-item>
          <a-descriptions-item :label="$t('chat.message.paramsLabels.duration')">
            {{ paramsImage.generationTime ? paramsImage.generationTime.toFixed(1) + 's' : '-' }}
          </a-descriptions-item>
          <a-descriptions-item :label="$t('chat.message.paramsLabels.filename')" :span="2">
            {{ paramsImage.filename }}
          </a-descriptions-item>
        </a-descriptions>
      </div>
    </a-modal>

    <!-- 收录为常用提示词：预填消息内容，可编辑标题与内容后保存 -->
    <a-modal
      v-model:open="saveSnippetVisible"
      :title="$t('chat.message.saveSnippetModalTitle')"
      :ok-text="$t('common.confirm')"
      :cancel-text="$t('common.cancel')"
      @ok="confirmSaveSnippet"
    >
      <div class="save-snippet-field">
        <div class="modal-label">{{ $t('settings.prompts.form.title') }}</div>
        <a-input v-model:value="saveSnippetDraft.title" :placeholder="$t('settings.prompts.form.titlePlaceholder')" />
      </div>
      <div class="save-snippet-field" style="margin-bottom: 0;">
        <div class="modal-label">{{ $t('settings.prompts.form.prompt') }}</div>
        <a-textarea
          v-model:value="saveSnippetDraft.prompt"
          :auto-size="{ minRows: 4, maxRows: 12 }"
          :placeholder="$t('settings.prompts.form.promptPlaceholder')"
        />
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import {
  LinkOutlined,
  DownloadOutlined,
  InfoCircleOutlined,
  CopyOutlined,
  EditOutlined,
  PictureOutlined,
  LoadingOutlined,
  CloseCircleFilled,
  WarningOutlined,
  PlusOutlined,
  RollbackOutlined,
  DeleteOutlined,
  ArrowDownOutlined,
  BookOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { thumbUrl } from '@/lib/image'
import AppButton from './AppButton.vue'
import type { ChatGeneratedImage, ChatMessage, ChatProvider } from '@/types'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const listRef = ref<HTMLElement | null>(null)

// ==================== 图片预览 ====================

// 单个受控预览实例服务整个列表：列表项只渲染懒加载缩略图，
// 点开才加载原图（原来每张图一个 a-image，长会话下几百个组件实例 + 全尺寸解码直接把内存吃爆）
const previewVisible = ref(false)
const previewSrc = ref('')

function openPreview(url: string) {
  previewSrc.value = url
  previewVisible.value = true
}

// 有真实像素尺寸时按宽高比占位，懒加载图片上屏时列表不跳动
function genImgStyle(img: ChatGeneratedImage) {
  const meta = img.metadata
  if (meta?.width && meta?.height) return { aspectRatio: `${meta.width} / ${meta.height}` }
  const d = imgDims.get(img.id)
  return d ? { aspectRatio: `${d.w} / ${d.h}` } : undefined
}

// ==================== 屏幕外图片销毁 ====================
// loading=lazy 只保证屏幕外不加载；已解码的图滚走后位图仍驻留内存（每张 ~1.4MB），
// 长会话滚过一遍后几百张缩略图全驻留也有几百 MB。
// 进入过近视口区（上下各一屏）又离开 30s 的行，卸载其中的 <img> 让解码位图随 GC 释放；
// 回到近视口区自动重挂 —— 缩略图带 immutable 缓存，重挂只是一次快速解码。
// 占位元素沿用图片宽高比，滚动位置不跳。
const OFFSCREEN_DESTROY_DELAY = 30_000

const destroyedRows = reactive(new Set<string>())
const rowEls = new Map<string, Element>()
const seenRows = new Set<string>()
const rowDestroyTimers = new Map<string, ReturnType<typeof setTimeout>>()
// 无 metadata 的图片在首次加载后记录实际宽高，供销毁后占位
const imgDims = new Map<string, { w: number; h: number }>()

function recordImgDims(id: string, e: Event) {
  const el = e.target as HTMLImageElement
  if (el.naturalWidth && el.naturalHeight) imgDims.set(id, { w: el.naturalWidth, h: el.naturalHeight })
}

let rowObserver: IntersectionObserver | null = null

onMounted(() => {
  rowObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const id = (entry.target as HTMLElement).dataset.msgId
      if (!id) continue
      if (entry.isIntersecting) {
        seenRows.add(id)
        clearTimeout(rowDestroyTimers.get(id))
        rowDestroyTimers.delete(id)
        destroyedRows.delete(id)
      } else if (seenRows.has(id) && !rowDestroyTimers.has(id)) {
        // 只为"看过又离开"的行安排销毁；从未进入视口的行本来就没有位图可释放
        rowDestroyTimers.set(id, setTimeout(() => {
          rowDestroyTimers.delete(id)
          destroyedRows.add(id)
        }, OFFSCREEN_DESTROY_DELAY))
      }
    }
  }, { root: listRef.value, rootMargin: '100% 0px' })
  // 函数 ref 早于 onMounted 触发，初始行在这里统一补登记
  for (const el of rowEls.values()) rowObserver.observe(el)
})

onBeforeUnmount(() => {
  rowObserver?.disconnect()
  for (const t of rowDestroyTimers.values()) clearTimeout(t)
  resetDeleteConfirm()
  if (queueBlinkTimer) clearTimeout(queueBlinkTimer)
})

function setRowRef(el: Element | null, id: string) {
  if (el) {
    rowEls.set(id, el)
    rowObserver?.observe(el)
  } else {
    const prev = rowEls.get(id)
    if (prev) rowObserver?.unobserve(prev)
    rowEls.delete(id)
    seenRows.delete(id)
    clearTimeout(rowDestroyTimers.get(id))
    rowDestroyTimers.delete(id)
    destroyedRows.delete(id)
  }
}

// 切换会话：行全部重挂，销毁状态与尺寸缓存随之失效
watch(() => chatStore.activeConversationId, () => {
  destroyedRows.clear()
  imgDims.clear()
})

// ==================== 回到底部 ====================

const showScrollToBottom = ref(false)

function handleScroll() {
  const el = listRef.value
  if (!el) return
  showScrollToBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight > 300
}

function scrollToBottom() {
  const el = listRef.value
  if (!el) return
  el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
}

// ==================== 生成队列 ====================

const queueGeneratingCount = computed(() => chatStore.genQueue.filter(e => e.status === 'generating').length)

// 队列任务了结（成功/失败）时脉冲闪烁队列开关，替代之前的列表跳转提示；
// 面板已打开时用户能直接看到状态变化，不闪
const queueBtnBlink = ref(false)
let queueBlinkTimer: ReturnType<typeof setTimeout> | null = null
watch(() => chatStore.queueSettleTick, async () => {
  if (chatStore.queueOpen) return
  queueBtnBlink.value = false // 先复位，连续事件才能重新触发动画
  await nextTick()
  queueBtnBlink.value = true
  if (queueBlinkTimer) clearTimeout(queueBlinkTimer)
  queueBlinkTimer = setTimeout(() => { queueBtnBlink.value = false }, 2000)
})

// 队列卡片跳转：滚动到指定消息并短暂高亮（供 ChatPanel 调用）
function scrollToMessage(msgId: string) {
  const el = listRef.value?.querySelector(`#msg-${CSS.escape(msgId)}`) as HTMLElement | null
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('msg-highlight')
  setTimeout(() => el.classList.remove('msg-highlight'), 1600)
}

defineExpose({ scrollToMessage })

// ==================== 原地编辑 ====================

const editingId = ref<string | null>(null)
const editingText = ref('')

// 只有下一条 assistant 消息存在且不在生成中时才允许编辑
function canEdit(msg: ChatMessage): boolean {
  const msgs = chatStore.activeConversation?.messages || []
  const idx = msgs.findIndex(m => m.id === msg.id)
  const next = msgs[idx + 1]
  return next?.role === 'assistant' && next.status !== 'generating'
}

function startEdit(msg: ChatMessage) {
  editingId.value = msg.id
  editingText.value = msg.prompt
}

function cancelEdit() {
  editingId.value = null
}

async function confirmEdit() {
  if (!editingId.value) return
  const id = editingId.value
  const text = editingText.value
  editingId.value = null
  await chatStore.editAndResend(id, text)
}

function handleEditEnter(e: KeyboardEvent) {
  if (e.shiftKey) return // Shift+Enter 换行
  e.preventDefault()
  confirmEdit()
}

const paramsVisible = ref(false)
const paramsImage = ref<ChatGeneratedImage | null>(null)

function openParams(img: ChatGeneratedImage) {
  paramsImage.value = img
  paramsVisible.value = true
}

// ==================== 收录为常用提示词 ====================

const saveSnippetVisible = ref(false)
const saveSnippetDraft = ref({ title: '', prompt: '' })

function openSaveSnippet(msg: ChatMessage) {
  // 标题预填提示词首行前 20 字，多数情况可直接确认
  saveSnippetDraft.value = {
    title: msg.prompt.split('\n')[0].trim().slice(0, 20),
    prompt: msg.prompt,
  }
  saveSnippetVisible.value = true
}

async function confirmSaveSnippet() {
  const prompt = saveSnippetDraft.value.prompt.trim()
  if (!prompt) return
  try {
    await settingsStore.addPromptSnippet({ title: saveSnippetDraft.value.title.trim(), prompt })
    saveSnippetVisible.value = false
    message.success(t('chat.message.snippetSaved'))
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || t('errors.saveFailed'))
  }
}

async function copyPrompt(prompt: string) {
  try {
    await navigator.clipboard.writeText(prompt)
    message.success(t('common.copied'))
  } catch {
    message.error(t('errors.copyFailed'))
  }
}

function providerLabel(provider: ChatProvider, model?: string): string {
  return settingsStore.providerLabel(provider, model)
}

// 生成中剩余占位骨架数：已完成的图渐进上屏、已失败的任务也不再占位
function remainingShimmerCount(msg: ChatMessage): number {
  return Math.max((msg.count || 1) - msg.generatedImages.length - (msg.failedCount || 0), 0)
}

function generatingText(msg: ChatMessage): string {
  const total = msg.count || 1
  const done = msg.generatedImages.length
  const base = total > 1
    ? t('chat.message.generatingPlural', { n: total })
    : t('chat.message.generatingSingle')
  const progress = done > 0 && done < total ? t('chat.message.progressDone', { done, total }) : ''
  return t('chat.message.generatingWrap', {
    base,
    provider: providerLabel(msg.provider, msg.model),
    progress,
  })
}

function handleReference(img: ChatGeneratedImage) {
  chatStore.addPendingReference(img)
}

function handleGenerateMore(msg: ChatMessage) {
  chatStore.generateOneMore(msg.id)
}

// 删除消息：无产出的消息用行内两步确认（第一次点击进入红色确认态，3s 内再点执行，超时还原）；
// 已有实际产出（至少一张生成图）的消息走更强的 Modal 确认，避免误删成果
const confirmingDeleteId = ref<string | null>(null)
let deleteConfirmTimer: ReturnType<typeof setTimeout> | null = null

function resetDeleteConfirm() {
  confirmingDeleteId.value = null
  if (deleteConfirmTimer) {
    clearTimeout(deleteConfirmTimer)
    deleteConfirmTimer = null
  }
}

function handleDeleteClick(msg: ChatMessage) {
  const msgs = chatStore.activeConversation?.messages || []
  const idx = msgs.findIndex(m => m.id === msg.id)
  const assistant = msgs[idx + 1]
  const imageCount = assistant?.role === 'assistant' ? assistant.generatedImages.length : 0
  if (imageCount > 0) {
    Modal.confirm({
      title: t('chat.message.deleteModalTitle'),
      content: imageCount > 1
        ? t('chat.message.deleteModalContentPlural', { imageCount })
        : t('chat.message.deleteModalContentSingle', { imageCount }),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => chatStore.deleteMessage(msg.id),
    })
    return
  }
  if (confirmingDeleteId.value === msg.id) {
    resetDeleteConfirm()
    chatStore.deleteMessage(msg.id)
    return
  }
  resetDeleteConfirm()
  confirmingDeleteId.value = msg.id
  deleteConfirmTimer = setTimeout(resetDeleteConfirm, 3000)
}

// 消息变化时滚动到底部：只在切换会话或新增消息时滚；同一会话内删除消息（变短）不滚，保持阅读位置。
// 生成完成等状态变化不再跳转——完成时骨架移除内容缩短，浏览器会把滚动位置自然钳在底部，
// 阅读历史的用户则完全不受打扰（由队列开关闪烁代为提示）
watch(
  () => [
    chatStore.activeConversationId,
    chatStore.activeConversation?.messages.length,
  ],
  async ([convId, newLen], [oldConvId, oldLen]) => {
    if (convId === oldConvId && (newLen ?? 0) < (oldLen ?? 0)) return
    await nextTick()
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  }
)
</script>

<style scoped>
.chat-message-list {
  flex: 1;
  overflow-y: auto;
  background: transparent;
}

/* 居中内容列：与 ChatGPT 一致的单栏阅读宽度 */
.messages-column {
  max-width: 800px;
  margin: 0 auto;
  padding: 24px 24px 8px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 15px;
}

.empty-icon {
  font-size: 40px;
  color: var(--empty-icon);
  margin-bottom: 12px;
}

.empty-sub {
  font-size: 13px;
  color: var(--text-faint);
}

.message-row {
  margin-bottom: 28px;
  /* 不用 content-visibility 跳渲染：屏幕外的行在快速滚动时要同步补 style/layout/paint，
     补不上的窗口期就是白屏。滚动查看体验优先（见 AGENTS.md） */
}

/* ---------- 用户消息 ---------- */

.user-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.bubble {
  word-break: break-word;
}

.user-bubble {
  max-width: 75%;
  padding: 10px 16px;
  border-radius: var(--bubble-radius);
  border: var(--bubble-border);
  background: var(--bubble-bg);
  box-shadow: var(--bubble-shadow);
  color: var(--bubble-text);
  text-shadow: var(--bubble-text-shadow);
}

/* 编辑态：气泡展开到舒适宽度，输入框去边框融入气泡 */
.user-bubble.editing {
  width: min(640px, 100%);
  max-width: 100%;
  border-radius: var(--bubble-radius);
  padding: 12px 14px 10px;
}

.user-bubble.editing :deep(.ant-input) {
  padding: 0;
  font-size: 15px;
  line-height: 1.6;
  background: transparent;
  color: var(--bubble-text);
  resize: none;
  box-shadow: none !important;
}

.prompt-text {
  white-space: pre-wrap;
  line-height: 1.6;
  font-size: 15px;
}

.ref-images {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.ref-img {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 8px;
  cursor: zoom-in;
}

/* 编辑入口：气泡下方，悬停整行时出现 */
.msg-actions {
  display: flex;
  gap: 2px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.message-row.user:hover .msg-actions {
  opacity: 1;
}

.icon-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--iconbtn-text);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  transition: background 0.15s, color 0.15s;
}

.icon-btn:hover {
  background: var(--iconbtn-hover-bg);
  color: var(--iconbtn-hover-text);
}

.delete-btn:hover {
  color: #ff4d4f;
}

/* 两步确认态：红底白字，3s 内再点一次执行删除 */
.delete-btn.confirming,
.delete-btn.confirming:hover {
  background: #ff4d4f;
  color: #fff;
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

/* 收录提示词 modal */
.save-snippet-field {
  margin-bottom: 16px;
}

.modal-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

/* ---------- assistant 消息 ---------- */

.assistant-wrap {
  width: 100%;
}

/* 生成中：骨架占位 + 呼吸动画 */
.generating-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 渐进生成时骨架跟在已完成图片后面，保持与网格相同的间距 */
.generated-images + .generating-card {
  margin-top: 12px;
}

.shimmer-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.shimmer-block {
  width: 220px;
  height: 220px;
  border-radius: 12px;
  background: linear-gradient(100deg, var(--shimmer-base) 40%, var(--shimmer-hl) 50%, var(--shimmer-base) 60%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.generating-text {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--generating-text);
  font-size: 13px;
}

/* 失败：轻量内联错误块 */
.error-box {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 560px;
  padding: 12px 14px;
  background: #fff2f0;
  border: 1px solid #ffccc7;
  border-radius: 10px;
}

/* 部分任务失败：图片网格上方的提示条 */
.partial-error {
  max-width: 560px;
  margin-bottom: 8px;
  padding: 8px 12px;
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 10px;
  color: #ad6800;
  font-size: 13px;
}

.error-icon {
  color: #ff4d4f;
  margin-top: 2px;
}

.error-content {
  flex: 1;
  min-width: 0;
}

.error-title {
  font-size: 13px;
  font-weight: 500;
  color: #cf1322;
}

.error-desc {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
  word-break: break-word;
}

/* 生成结果图片 */
.generated-images {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.generated-image-card {
  position: relative;
  width: 220px;
  max-width: 100%;
}

.generated-image-card.single {
  width: min(360px, 100%);
}

.gen-img {
  display: block;
  width: 100%;
  border-radius: var(--img-radius);
  border: 1px solid var(--img-border);
  cursor: zoom-in;
}

/* 屏幕外销毁后的占位：保持尺寸与边框轮廓，回到视口前图片已重挂，基本不会被看到 */
.img-placeholder {
  cursor: default;
  background: var(--shimmer-base);
}

/* 悬停浮层操作：替代之前的工具条按钮 */
.img-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s;
}

.generated-image-card:hover .img-overlay {
  opacity: 1;
}

.overlay-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  color: #333;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, transform 0.15s;
}

.overlay-btn:hover {
  background: #fff;
  transform: scale(1.06);
}

.gen-time {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: 11px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  padding: 2px 6px;
  border-radius: 8px;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}

.generated-image-card:hover .gen-time {
  opacity: 1;
}

/* 追加生成一张：网格末尾的小圆按钮，低调不抢视觉 */
.add-image-btn {
  align-self: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--addbtn-border);
  border-radius: 50%;
  background: var(--addbtn-bg);
  color: var(--addbtn-text);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, color 0.15s;
}

.add-image-btn:hover {
  border-color: var(--addbtn-hover-border);
  color: var(--addbtn-hover-text);
}

/* 回到底部：sticky 定位在滚动容器可视区底部；height:0 不占文档流，按钮相对锚点上浮 */
.scroll-bottom-anchor {
  position: sticky;
  bottom: 12px;
  height: 0;
  z-index: 10;
}

/* 生成队列开关：sticky 悬浮在可视区右上角（同 scroll-bottom-anchor 模式） */
.queue-toggle-anchor {
  position: sticky;
  top: 12px;
  height: 0;
  z-index: 10;
}

.queue-toggle-btn {
  position: absolute;
  top: 0;
  right: 24px;
  width: 34px;
  height: 34px;
  border: 1px solid var(--addbtn-border);
  border-radius: 50%;
  background: var(--addbtn-bg);
  color: var(--addbtn-text);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: border-color 0.15s, color 0.15s;
}

.queue-toggle-btn:hover,
.queue-toggle-btn.active {
  color: var(--addbtn-hover-text);
}

/* 队列任务了结提示：面板关闭时脉冲闪烁（0.5s×4，与 queueBtnBlink 的 2s 定时对应） */
.queue-toggle-btn.blink {
  animation: queue-toggle-blink 0.5s ease-in-out 4;
}

@keyframes queue-toggle-blink {
  0%, 100% {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }
  50% {
    border-color: #1677ff;
    color: #1677ff;
    box-shadow: 0 0 0 6px rgba(22, 119, 255, 0.22);
  }
}

/* 进行中数量角标 */
.queue-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #1677ff;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
}

/* 队列跳转定位：整行背景短暂高亮 */
.message-row.msg-highlight {
  border-radius: 12px;
  animation: msg-flash 1.6s ease-out;
}

@keyframes msg-flash {
  0% { background-color: rgba(22, 119, 255, 0.16); }
  100% { background-color: transparent; }
}

.scroll-bottom-btn {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 34px;
  height: 34px;
  border: 1px solid var(--addbtn-border);
  border-radius: 50%;
  background: var(--addbtn-bg);
  color: var(--addbtn-text);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: border-color 0.15s, color 0.15s;
}

.scroll-bottom-btn:hover {
  border-color: var(--addbtn-hover-border);
  color: var(--addbtn-hover-text);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
