<template>
  <aside class="queue-panel">
    <div class="queue-header">
      <ThunderboltOutlined class="queue-title-icon" />
      <span class="queue-title">{{ $t('chat.queue.title') }}</span>
      <span v-if="generatingCount > 0" class="queue-count">{{ generatingCount }}</span>
      <div class="queue-header-actions">
        <a-tooltip v-if="hasFinished" :title="$t('chat.queue.clearFinished')">
          <button class="queue-action-btn" @click="chatStore.clearFinishedQueue()">
            <ClearOutlined />
          </button>
        </a-tooltip>
        <a-tooltip :title="$t('common.close')">
          <button class="queue-action-btn" @click="chatStore.queueOpen = false">
            <CloseOutlined />
          </button>
        </a-tooltip>
      </div>
    </div>

    <div v-if="chatStore.genQueue.length === 0" class="queue-empty">
      {{ $t('chat.queue.empty') }}
    </div>

    <div v-else class="queue-list" ref="listRef">
      <div
        v-for="entry in displayQueue"
        :key="entry.id"
        class="queue-card"
        @click="emit('jump', entry.convId, entry.messageId)"
      >
        <!-- 每张图片一个条目：缩略图直接呈现该图状态 -->
        <div class="queue-thumb" :class="entry.status">
          <img
            v-if="entry.status === 'done' && entry.image"
            :src="thumbUrl(entry.image.url, 128)"
            :alt="entry.image.filename"
            loading="lazy"
          />
          <LoadingOutlined v-else-if="entry.status === 'generating'" class="thumb-icon" />
          <CloseCircleFilled v-else class="thumb-icon" />
        </div>
        <div class="queue-info">
          <div class="queue-card-top">
            <span class="queue-conv-title" :title="convTitle(entry.convId)">{{ convTitle(entry.convId) }}</span>
            <span class="queue-time">{{ formatTime(entry.startedAt) }}</span>
          </div>
          <div class="queue-prompt">{{ entry.prompt }}</div>
          <div class="queue-status-text" :class="entry.status" :title="entry.error || ''">
            {{ $t(`chat.queue.status_${entry.status}`) }}
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ThunderboltOutlined, ClearOutlined, CloseOutlined, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import { useChatStore } from '@/stores/chat'
import { thumbUrl } from '@/lib/image'

const emit = defineEmits<{ jump: [convId: string, messageId: string] }>()

const chatStore = useChatStore()

const generatingCount = computed(() => chatStore.genQueue.filter(e => e.status === 'generating').length)
const hasFinished = computed(() => chatStore.genQueue.some(e => e.status !== 'generating'))

// 展示层反转：store 里新条目 unshift 在头部，面板按聊天记录式排序（最新在底部）
const displayQueue = computed(() => [...chatStore.genQueue].reverse())

// 新条目落到底部时自动滚到底，保持最新可见（清理完成条目导致变短不滚）
const listRef = ref<HTMLElement | null>(null)
watch(() => chatStore.genQueue.length, async (len, prev) => {
  if (len <= (prev ?? 0)) return
  await nextTick()
  listRef.value?.scrollTo({ top: listRef.value.scrollHeight })
})

// 会话标题从列表实时查（改名跟随）；会话被删时条目已同步移除，兜底 '-'
function convTitle(convId: string): string {
  return chatStore.conversationList.find(c => c.id === convId)?.title || '-'
}

function formatTime(ts: number): string {
  return dayjs(ts).format('HH:mm')
}
</script>

<style scoped>
.queue-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--sider-border);
  background: var(--sider-bg);
  min-height: 0;
}

.queue-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--sider-border);
}

.queue-title-icon {
  font-size: 13px;
  color: var(--sider-icon);
}

.queue-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sider-text);
}

/* 进行中计数：蓝色小胶囊 */
.queue-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #1677ff;
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.queue-header-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.queue-action-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sider-icon);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.queue-action-btn:hover {
  background: var(--sider-item-hover);
  color: var(--sider-text);
}

.queue-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  font-size: 13px;
  padding: 24px;
  text-align: center;
}

.queue-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.queue-card {
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.queue-card:hover {
  border-color: var(--border-strong);
  background: var(--sider-item-hover);
}

/* 缩略图：完成显示图片 / 生成中 shimmer 骨架 / 失败红底错误标 */
.queue-thumb {
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
}

.queue-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.queue-thumb.generating {
  background: linear-gradient(100deg, var(--shimmer-base) 40%, var(--shimmer-hl) 50%, var(--shimmer-base) 60%);
  background-size: 200% 100%;
  animation: queue-shimmer 1.4s infinite linear;
  color: var(--text-faint);
}

.queue-thumb.error {
  background: #fff2f0;
  border-color: #ffccc7;
  color: #ff4d4f;
}

.thumb-icon {
  font-size: 18px;
}

@keyframes queue-shimmer {
  to {
    background-position: -200% 0;
  }
}

.queue-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.queue-card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.queue-conv-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-secondary);
}

.queue-time {
  font-size: 11px;
  color: var(--text-faint);
  flex-shrink: 0;
}

.queue-prompt {
  margin-top: 2px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.queue-status-text {
  margin-top: auto;
  font-size: 12px;
}

.queue-status-text.generating {
  color: #1677ff;
}

.queue-status-text.done {
  color: #52c41a;
}

.queue-status-text.error {
  color: #ff4d4f;
}
</style>
