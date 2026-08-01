<template>
  <div ref="listRef" class="chat-message-list" @scroll.passive="handleScroll">
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
                  <a-image
                    v-for="ref in msg.referenceImages"
                    :key="ref.id"
                    :src="ref.url"
                    :width="72"
                    :height="72"
                    decoding="async"
                    style="object-fit: cover; border-radius: 8px;"
                  />
                </div>
                <div class="prompt-text">{{ msg.prompt }}</div>
              </template>
            </div>
            <div v-if="editingId !== msg.id" class="msg-actions">
              <a-tooltip :title="$t('chat.message.fillBack')">
                <button class="icon-btn" @click="chatStore.setDraftPrompt(msg.prompt, msg.referenceImages)">
                  <RollbackOutlined />
                </button>
              </a-tooltip>
              <a-tooltip :title="$t('chat.message.copyPrompt')">
                <button class="icon-btn" @click="copyPrompt(msg.prompt)">
                  <CopyOutlined />
                </button>
              </a-tooltip>
              <a-tooltip :title="$t('chat.message.saveSnippetTooltip')">
                <button class="icon-btn" @click="openSaveSnippet(msg)">
                  <BookOutlined />
                </button>
              </a-tooltip>
              <a-tooltip v-if="canEdit(msg)" :title="$t('chat.message.editTooltip')">
                <button class="icon-btn" @click="startEdit(msg)">
                  <EditOutlined />
                </button>
              </a-tooltip>
              <a-popconfirm
                :title="$t('chat.message.deleteConfirm')"
                :ok-text="$t('common.delete')"
                :cancel-text="$t('common.cancel')"
                @confirm="handleDelete(msg)"
              >
                <a-tooltip :title="$t('common.delete')">
                  <button class="icon-btn delete-btn">
                    <DeleteOutlined />
                  </button>
                </a-tooltip>
              </a-popconfirm>
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
                <a-image :src="img.url" class="gen-img" decoding="async" />
                <div class="img-overlay">
                  <a-tooltip :title="$t('chat.message.referenceTooltip')">
                    <button class="overlay-btn" @click="handleReference(img)">
                      <LinkOutlined />
                    </button>
                  </a-tooltip>
                  <a-tooltip :title="$t('chat.message.paramsTooltip')">
                    <button class="overlay-btn" @click="openParams(img)">
                      <InfoCircleOutlined />
                    </button>
                  </a-tooltip>
                  <a :href="img.url" :download="img.filename">
                    <a-tooltip :title="$t('chat.message.downloadTooltip')">
                      <button class="overlay-btn">
                        <DownloadOutlined />
                      </button>
                    </a-tooltip>
                  </a>
                </div>
                <span v-if="img.generationTime" class="gen-time">{{ img.generationTime.toFixed(1) }}s</span>
              </div>
              <!-- 追加生成一张：复用本消息的提示词与参考图，生成中也可点 -->
              <a-tooltip v-if="msg.status === 'done' || msg.status === 'generating'" :title="$t('chat.message.generateOneMore')">
                <button class="add-image-btn" @click="handleGenerateMore(msg)">
                  <PlusOutlined />
                </button>
              </a-tooltip>
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
        <a-tooltip v-if="showScrollToBottom" :title="$t('chat.message.scrollToBottom')">
          <button class="scroll-bottom-btn" @click="scrollToBottom">
            <ArrowDownOutlined />
          </button>
        </a-tooltip>
      </Transition>
    </div>

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
import { ref, watch, nextTick } from 'vue'
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
} from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import AppButton from './AppButton.vue'
import type { ChatGeneratedImage, ChatMessage, ChatProvider } from '@/types'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const listRef = ref<HTMLElement | null>(null)

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

// 删除消息：已有实际产出（至少一张生成图）时再弹一次确认，避免误删成果
function handleDelete(msg: ChatMessage) {
  const msgs = chatStore.activeConversation?.messages || []
  const idx = msgs.findIndex(m => m.id === msg.id)
  const assistant = msgs[idx + 1]
  const imageCount = assistant?.role === 'assistant' ? assistant.generatedImages.length : 0
  if (imageCount === 0) {
    chatStore.deleteMessage(msg.id)
    return
  }
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
}

// 消息变化时滚动到底部；同一会话内删除消息（变短）不滚，保持当前阅读位置
watch(
  () => [
    chatStore.activeConversationId,
    chatStore.activeConversation?.messages.length,
    chatStore.activeConversation?.messages[chatStore.activeConversation.messages.length - 1]?.status,
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
  /* 长对话优化：浏览器跳过屏幕外消息行的布局/绘制，打开长会话与滚动时显著减负。
     contain-intrinsic-size 给未渲染行一个占位高度估计，auto 表示渲染过后记住实际高度，减少滚动跳动 */
  content-visibility: auto;
  contain-intrinsic-size: auto 280px;
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

.generated-image-card :deep(.ant-image) {
  display: block;
  width: 100%;
}

.generated-image-card :deep(.ant-image-img) {
  width: 100%;
  border-radius: var(--img-radius);
  border: 1px solid var(--img-border);
  display: block;
}

/* 隐藏 antd 自带的悬停遮罩（保留点击预览），避免与浮层按钮叠加 */
.generated-image-card :deep(.ant-image-mask),
.ref-images :deep(.ant-image-mask) {
  display: none;
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
