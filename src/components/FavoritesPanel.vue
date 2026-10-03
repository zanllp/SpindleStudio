<template>
  <aside class="fav-panel">
    <div class="fav-header">
      <StarFilled class="fav-title-icon" />
      <span class="fav-title">{{ $t('chat.favorites.title') }}</span>
      <span v-if="favorites.length > 0" class="fav-count">{{ favorites.length }}</span>
      <div class="fav-header-actions">
        <button class="fav-action-btn" :title="$t('common.close')" @click="chatStore.favoritesOpen = false">
          <CloseOutlined />
        </button>
      </div>
    </div>

    <div class="fav-search-row">
      <input
        v-model="keyword"
        class="fav-search"
        type="text"
        :placeholder="$t('chat.favorites.searchPlaceholder')"
      />
    </div>

    <div class="fav-filter-row">
      <button
        v-for="opt in FILTERS"
        :key="opt.value"
        class="fav-filter-btn"
        :class="{ active: filter === opt.value }"
        @click="filter = opt.value"
      >
        {{ $t(opt.label) }}
      </button>
    </div>

    <div class="fav-list">
      <div v-if="favorites.length === 0" class="fav-empty">
        {{ $t('chat.favorites.empty') }}
      </div>
      <div v-else-if="filtered.length === 0" class="fav-empty">
        {{ $t('chat.favorites.noResult') }}
      </div>
      <template v-else>
        <div
          v-for="fav in filtered"
          :key="fav.id"
          class="fav-card"
          @click="emit('jump', fav.messageId)"
        >
          <div class="fav-card-top">
            <span class="fav-type" :class="fav.type">
              {{ fav.type === 'query' ? $t('chat.favorites.typeQuery') : $t('chat.favorites.typeResp') }}
            </span>
            <span class="fav-time">{{ formatTime(fav.createdAt) }}</span>
            <button
              class="fav-card-btn"
              :data-tip="$t('chat.favorites.remove')"
              data-tip-placement="left"
              @click.stop="chatStore.removeFavorite(fav.id)"
            >
              <StarFilled />
            </button>
          </div>

          <div v-if="fav.referenceImages && fav.referenceImages.length > 0" class="fav-refs" @click.stop>
            <img
              v-for="ref in fav.referenceImages.slice(0, 4)"
              :key="ref.id"
              :src="thumbUrl(ref.url, 96)"
              loading="lazy"
              decoding="async"
              class="fav-ref-img"
              @click="emit('preview', ref.url)"
            />
          </div>

          <div class="fav-text">{{ fav.text }}</div>

          <div v-if="fav.images && fav.images.length > 0" class="fav-thumbs" @click.stop>
            <img
              v-for="url in fav.images.slice(0, 4)"
              :key="url"
              :src="thumbUrl(url, 128)"
              loading="lazy"
              decoding="async"
              class="fav-thumb"
              @click="emit('preview', url)"
            />
            <span v-if="fav.images.length > 4" class="fav-thumb-more">+{{ fav.images.length - 4 }}</span>
          </div>

          <div class="fav-card-actions" @click.stop>
            <button class="fav-link-btn" @click="emit('jump', fav.messageId)">
              <AimOutlined /> {{ $t('chat.favorites.jump') }}
            </button>
            <button class="fav-link-btn" @click="copy(fav.text)">
              <CopyOutlined /> {{ $t('chat.favorites.copy') }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { StarFilled, CloseOutlined, CopyOutlined, AimOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { thumbUrl } from '@/lib/image'

const emit = defineEmits<{
  jump: [messageId: string]
  preview: [url: string]
}>()

const chatStore = useChatStore()
const { t } = useI18n()

type Filter = 'all' | 'query' | 'resp'

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'chat.favorites.filterAll' },
  { value: 'query', label: 'chat.favorites.filterQuery' },
  { value: 'resp', label: 'chat.favorites.filterResp' },
]

const keyword = ref('')
const filter = ref<Filter>('all')

const favorites = computed(() => chatStore.favorites)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return favorites.value.filter(f => {
    if (filter.value !== 'all' && f.type !== filter.value) return false
    if (!kw) return true
    return f.text.toLowerCase().includes(kw)
  })
})

function formatTime(ts: number): string {
  return dayjs(ts).format('MM-DD HH:mm')
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    message.success(t('common.copied'))
  } catch {
    message.error(t('errors.copyFailed'))
  }
}
</script>

<style scoped>
/* 面板渲染在 --sider-bg 上，颜色一律走 --sider-* 变量族（与生成队列面板一致） */
.fav-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--sider-border);
  background: var(--sider-bg);
  min-height: 0;
}

.fav-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 12px 10px;
  border-bottom: 1px solid var(--sider-border);
}

.fav-title-icon {
  font-size: 13px;
  color: var(--sider-icon);
}

.fav-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sider-text);
}

.fav-count {
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

.fav-header-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.fav-action-btn {
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

.fav-action-btn:hover {
  background: var(--sider-item-hover);
  color: var(--sider-text);
}

.fav-search-row {
  padding: 8px 10px 0;
}

.fav-search {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid var(--sider-border);
  border-radius: 8px;
  background: transparent;
  color: var(--sider-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.fav-search::placeholder {
  color: var(--sider-faint);
}

.fav-search:focus {
  border-color: var(--sider-icon);
}

.fav-filter-row {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
}

.fav-filter-btn {
  padding: 3px 10px;
  border: 1px solid var(--sider-border);
  border-radius: 999px;
  background: transparent;
  color: var(--sider-icon);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.fav-filter-btn:hover {
  color: var(--sider-text);
}

.fav-filter-btn.active {
  border-color: transparent;
  background: var(--sider-item-active);
  color: var(--sider-item-active-text, var(--sider-text));
  font-weight: 600;
}

.fav-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.fav-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--sider-faint);
  font-size: 13px;
  padding: 32px 24px;
  text-align: center;
}

.fav-card {
  padding: 10px;
  border: 1px solid var(--queuecard-border, var(--sider-border));
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  background: var(--queuecard-bg, transparent);
  box-shadow: var(--queuecard-shadow, none);
  backdrop-filter: var(--queuecard-blur, none);
  -webkit-backdrop-filter: var(--queuecard-blur, none);
  transition: border-color 0.15s, background 0.15s;
}

.fav-card:hover {
  border-color: var(--sider-icon);
  background: var(--queuecard-hover-bg, var(--sider-item-hover));
}

.fav-card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* query / resp 类型角标 */
.fav-type {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  background: rgba(22, 119, 255, 0.14);
  color: #1677ff;
}

.fav-type.resp {
  background: rgba(82, 196, 26, 0.16);
  color: #389e0d;
}

.fav-time {
  font-size: 11px;
  color: var(--sider-faint);
}

.fav-card-btn {
  margin-left: auto;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #faad14;
  font-size: 12px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}

.fav-card-btn:hover {
  background: var(--sider-item-hover);
  color: #ff4d4f;
}

.fav-refs,
.fav-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  align-items: center;
}

.fav-ref-img {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid var(--sider-border);
  cursor: zoom-in;
}

.fav-thumb {
  width: 60px;
  height: 60px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--sider-border);
  cursor: zoom-in;
}

.fav-thumb-more {
  font-size: 12px;
  color: var(--sider-faint);
}

.fav-text {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--sider-text);
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fav-card-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.fav-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border: 1px solid var(--sider-border);
  border-radius: 7px;
  background: transparent;
  color: var(--sider-icon);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.fav-link-btn:hover {
  color: var(--sider-text);
  border-color: var(--sider-icon);
}
</style>
