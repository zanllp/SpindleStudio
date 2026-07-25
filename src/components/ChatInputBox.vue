<template>
  <div class="chat-input-box">
    <div class="input-column">
      <!-- 待发送的参考图 -->
      <div v-if="chatStore.pendingReferenceImages.length > 0" class="pending-refs">
        <div v-for="ref in chatStore.pendingReferenceImages" :key="ref.id" class="ref-thumb">
          <img :src="ref.url" :alt="$t('chat.input.refAlt')" />
          <CloseCircleFilled class="remove-ref" @click="chatStore.removePendingReference(ref.id)" />
        </div>
      </div>

      <!-- 圆角卡片式输入框 -->
      <div class="input-card">
        <a-textarea
          v-model:value="inputValue"
          :auto-size="{ minRows: 1, maxRows: 8 }"
          :bordered="false"
          :placeholder="$t('chat.input.placeholder')"
          @pressEnter="handlePressEnter"
          @paste="handlePaste"
        />

        <div class="input-toolbar">
          <div class="toolbar-left">
            <!-- 上传（悬停显示历史上传） -->
            <a-popover trigger="hover" placement="topLeft" @openChange="loadUploadHistory">
              <template #content>
                <div class="upload-history">
                  <div class="upload-history-title">{{ $t('chat.input.recentUploads') }}</div>
                  <div v-if="uploadHistoryLoading" class="upload-history-empty">
                    <a-spin size="small" />
                  </div>
                  <div v-else-if="uploadHistory.length === 0" class="upload-history-empty">{{ $t('chat.input.noUploads') }}</div>
                  <div v-else class="upload-history-grid">
                    <div
                      v-for="item in uploadHistory"
                      :key="item.relativePath"
                      class="upload-history-cell"
                      :title="item.filename"
                      @click="pickUpload(item)"
                    >
                      <img :src="item.url" :alt="item.filename" loading="lazy" />
                      <span v-if="item.useCount > 0" class="use-count">{{ item.useCount }}</span>
                    </div>
                  </div>
                </div>
              </template>
              <a-upload
                :show-upload-list="false"
                :before-upload="handleBeforeUpload"
                accept="image/png,image/jpeg,image/webp,image/gif"
              >
                <button class="tool-btn" :title="$t('chat.input.uploadTooltip')">
                  <PaperClipOutlined />
                </button>
              </a-upload>
            </a-popover>

            <!-- 生成参数 -->
            <a-popover trigger="click" placement="topLeft">
              <template #content>
                <div class="params-panel">
                  <div class="param-label">{{ $t('chat.input.sizeLabel') }}</div>
                  <a-select v-model:value="chatStore.chatSize" :options="sizeOptions" size="small" style="width: 100%;" />
                  <div class="param-label" style="margin-top: 10px;">{{ $t('chat.input.resolutionLabel') }}</div>
                  <a-radio-group v-model:value="chatStore.chatResolution" size="small" button-style="solid">
                    <a-radio-button value="1k">1K</a-radio-button>
                    <a-radio-button value="2k">2K</a-radio-button>
                    <a-radio-button value="4k" :disabled="is4kConstrained" :title="is4kConstrained ? $t('chat.input.resolution4kTooltip') : ''">4K</a-radio-button>
                  </a-radio-group>
                </div>
              </template>
              <button class="tool-btn" :title="$t('chat.input.paramsTooltip')">
                <ControlOutlined />
              </button>
            </a-popover>

            <!-- 生成张数：迷你步进器 -->
            <a-tooltip :title="$t('chat.input.countTooltip')">
              <div class="count-stepper">
                <button
                  class="stepper-btn"
                  :disabled="chatStore.chatCount <= MIN_COUNT"
                  @click="chatStore.chatCount--"
                >
                  <MinusOutlined />
                </button>
                <span class="stepper-value">{{ chatStore.chatCount }}</span>
                <button
                  class="stepper-btn"
                  :disabled="chatStore.chatCount >= MAX_COUNT"
                  @click="chatStore.chatCount++"
                >
                  <PlusOutlined />
                </button>
              </div>
            </a-tooltip>

            <!-- 供应商·模型选择（按供应商分组） -->
            <a-select
              :value="selectedModelKey"
              size="small"
              :bordered="false"
              class="model-select"
              :options="modelOptions"
              :dropdown-match-select-width="false"
              popup-class-name="model-select-dropdown"
              :placeholder="settingsStore.hasUsableProvider ? $t('chat.input.modelPlaceholder') : $t('chat.input.noProviderPlaceholder')"
              @change="handleModelChange"
            />

            <!-- 模式指示 -->
            <span class="mode-indicator" :class="{ img2img: chatStore.isImg2Img }">
              <span class="mode-dot"></span>{{ chatStore.isImg2Img ? $t('chat.input.img2img') : $t('chat.input.txt2img') }}
            </span>
          </div>

          <button class="send-btn" :disabled="!inputValue.trim()" :title="$t('chat.input.sendTooltip')" @click="handleSend">
            <ArrowUpOutlined />
          </button>
        </div>
      </div>

      <div class="input-hint">{{ $t('chat.input.hint') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { PaperClipOutlined, ArrowUpOutlined, CloseCircleFilled, ControlOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import api from '@/api'
import type { UploadHistoryItem } from '@/types'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const inputValue = ref('')

// 生成张数范围（每张图一个独立请求，上限避免一次打太多并发）
const MIN_COUNT = 1
const MAX_COUNT = 8

// 消息气泡"回填"：监听 store 草稿变化，填入输入框
watch(
  () => chatStore.draftPrompt,
  (text) => {
    if (text) {
      inputValue.value = text
      // 填入后清空，避免重复 watch 触发
      chatStore.draftPrompt = ''
    }
  }
)

// ==================== 上传历史（悬停面板） ====================

const uploadHistory = ref<UploadHistoryItem[]>([])
const uploadHistoryLoading = ref(false)

async function loadUploadHistory(open: boolean) {
  if (!open) return
  uploadHistoryLoading.value = true
  try {
    const { uploads } = await api.getUploads()
    uploadHistory.value = uploads
  } catch {
    uploadHistory.value = []
  } finally {
    uploadHistoryLoading.value = false
  }
}

// 点击历史图直接作为参考图（去重逻辑在 store 内）
function pickUpload(item: UploadHistoryItem) {
  chatStore.addPendingReference({ url: item.url, filename: item.filename })
}

// 与工作台 API Mart 面板一致的比例选项（label 走 i18n，随语言切换）
const SIZE_VALUES = ['auto', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '16:9', '9:16', '2:1', '1:2', '21:9', '9:21']
const sizeOptions = computed(() =>
  SIZE_VALUES.map(v => ({ value: v, label: t(`chat.input.sizes.${v}`) })),
)

// 4K 仅支持宽屏比例（由供应商类型的 uiHints 下发，当前只有 API Mart 有此限制；
// OpenAI 系映射为 quality 无此限制）
const WIDESCREEN_SIZES = new Set(['16:9', '9:16', '2:1', '1:2', '21:9', '9:21'])
const isWidescreenSize = computed(() => WIDESCREEN_SIZES.has(chatStore.chatSize))
const is4kConstrained = computed(
  () => !!settingsStore.selectedProvider?.uiHints?.widescreenOnly4k && !isWidescreenSize.value,
)

// ==================== 供应商·模型选择 ====================

// 选中值编码为 `${providerId}::${modelId}`，与 settings store 的 localStorage 键一致
const selectedModelKey = computed(() => {
  const { provider, model } = settingsStore.effectiveSelection
  return provider && model ? `${provider.id}::${model.id}` : undefined
})

const modelOptions = computed(() =>
  settingsStore.usableProviders.map(p => ({
    label: p.name,
    options: p.models
      .filter(m => m.enabled !== false)
      .map(m => ({ value: `${p.id}::${m.id}`, label: m.label })),
  })),
)

function handleModelChange(key: string) {
  const [providerId, modelId] = key.split('::')
  settingsStore.selectModel(providerId, modelId)
}

function uploadImageFile(file: File) {
  chatStore.addPendingUpload(file).catch((e) => {
    message.error(e.response?.data?.error || e.message || t('errors.uploadFailed'))
  })
}

function handleBeforeUpload(file: File) {
  uploadImageFile(file)
  return false
}

// 粘贴图片：剪贴板含图片文件时作为参考图上传（纯文本粘贴不受影响）
const PASTE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

function handlePaste(e: ClipboardEvent) {
  const allFiles = Array.from(e.clipboardData?.files || [])
  if (allFiles.length === 0) return
  const images = allFiles.filter(f => PASTE_IMAGE_TYPES.has(f.type))
  if (images.length === 0) {
    if (allFiles.some(f => f.type.startsWith('image/'))) {
      message.error(t('chat.input.unsupportedPaste'))
    }
    return
  }
  e.preventDefault() // 阻止把占位文件名插进输入框
  images.forEach(uploadImageFile)
}

function handlePressEnter(e: KeyboardEvent) {
  if (e.shiftKey) return // Shift+Enter 换行
  e.preventDefault()
  handleSend()
}

async function handleSend() {
  const prompt = inputValue.value.trim()
  if (!prompt) return
  inputValue.value = ''
  await chatStore.sendMessage(prompt)
}
</script>

<style scoped>
.chat-input-box {
  padding: 8px 24px 12px;
  background: transparent;
}

.input-column {
  max-width: 800px;
  margin: 0 auto;
}

/* ---------- 参考图缩略图 ---------- */

.pending-refs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.ref-thumb {
  position: relative;
  width: 60px;
  height: 60px;
}

.ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--border-subtle);
}

.remove-ref {
  position: absolute;
  top: -6px;
  right: -6px;
  color: var(--iconbtn-text);
  background: #fff;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  transition: color 0.15s;
}

.remove-ref:hover {
  color: #ff4d4f;
}

/* ---------- 输入卡片 ---------- */

.input-card {
  border: 1px solid var(--input-border);
  border-radius: var(--input-radius);
  padding: 8px 12px 6px;
  background: var(--input-bg);
  backdrop-filter: var(--input-blur);
  box-shadow: var(--input-shadow);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input-card:focus-within {
  border-color: var(--input-focus-border);
  box-shadow: var(--input-focus-shadow);
}

.input-card :deep(.ant-input) {
  padding: 6px 4px;
  font-size: 15px;
  line-height: 1.5;
  color: var(--text-primary);
  resize: none;
  box-shadow: none !important;
}

.input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

/* 图标按钮（上传 / 参数） */
.tool-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--toolbtn-text);
  font-size: 16px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.tool-btn:hover {
  background: var(--toolbtn-hover-bg);
  color: var(--toolbtn-hover-text);
}

/* 张数步进器：胶囊形容器，与工具栏图标按钮同高 */
.count-stepper {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  margin-left: 4px;
  padding: 1px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
}

.stepper-btn {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--toolbtn-text);
  font-size: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s, opacity 0.15s;
}

.stepper-btn:hover:not(:disabled) {
  background: var(--toolbtn-hover-bg);
  color: var(--toolbtn-hover-text);
}

.stepper-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stepper-value {
  min-width: 16px;
  text-align: center;
  font-size: 12px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  user-select: none;
}

/* 通道下拉：无边框弱化成文本级控件 */
.model-select {
  min-width: 128px;
}

.model-select :deep(.ant-select-selector) {
  padding: 0 6px;
  font-size: 13px;
  color: var(--toolbtn-text);
}

.model-select :deep(.ant-select-selection-item) {
  color: var(--toolbtn-text);
}

/* 模式指示：彩色小圆点 + 文字，替代之前的彩色 tag */
.mode-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 8px;
  font-size: 12px;
  color: var(--mode-text);
  white-space: nowrap;
}

.mode-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--mode-dot);
}

.mode-indicator.img2img {
  color: #b25e09;
}

.mode-indicator.img2img .mode-dot {
  background: #fa8c16;
}

/* 圆形发送按钮 */
.send-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: var(--send-border);
  border-radius: 50%;
  background: var(--send-bg);
  box-shadow: var(--send-shadow);
  color: var(--send-text);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, box-shadow 0.15s;
}

.send-btn:hover:not(:disabled) {
  background: var(--send-hover-bg);
  box-shadow: var(--send-hover-shadow);
}

.send-btn:disabled {
  background: var(--send-disabled-bg);
  border: none;
  box-shadow: none;
  color: var(--send-disabled-text);
  cursor: not-allowed;
}

.input-hint {
  margin-top: 6px;
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
}

/* ---------- 参数面板 ---------- */

.params-panel {
  width: 240px;
}

.param-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

/* ---------- 上传历史：3x3 网格可滚动 ---------- */

.upload-history {
  width: 212px; /* 3 * 64 + 2 * 8 + 边框余量 */
}

.upload-history-title {
  font-size: 12px;
  color: var(--text-faint);
  margin-bottom: 8px;
}

.upload-history-empty {
  color: var(--text-faint);
  font-size: 13px;
  text-align: center;
  padding: 16px 0;
}

.upload-history-grid {
  display: grid;
  grid-template-columns: repeat(3, 64px);
  gap: 6px;
  max-height: 204px; /* 3 行，超出滚动 */
  overflow-y: auto;
}

.upload-history-cell {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--border-subtle);
  transition: border-color 0.15s;
}

.upload-history-cell:hover {
  border-color: var(--border-strong);
}

.upload-history-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.use-count {
  position: absolute;
  right: 2px;
  bottom: 2px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 8px;
}
</style>
