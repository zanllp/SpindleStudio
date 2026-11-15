<template>
  <a-modal
    v-model:open="chatStore.allFavoritesOpen"
    :footer="null"
    :width="'min(1180px, calc(100vw - 32px))'"
    :style="{ top: '20px' }"
    wrap-class-name="all-favorites-modal"
  >
    <template #title>
      <div class="all-fav-modal-title">
        <StarFilled />
        <span>{{ $t('chat.favorites.allTitle') }}</span>
        <span v-if="chatStore.allFavorites.length > 0" class="all-fav-total">{{ chatStore.allFavorites.length }}</span>
      </div>
    </template>

    <div class="all-fav-shell">
      <div class="all-fav-toolbar">
        <input
          v-model="keyword"
          class="all-fav-search"
          type="text"
          :placeholder="$t('chat.favorites.allSearchPlaceholder')"
        />
        <div class="all-fav-filters">
          <button
            v-for="opt in FILTERS"
            :key="opt.value"
            class="all-fav-filter"
            :class="{ active: filter === opt.value }"
            @click="filter = opt.value"
          >
            {{ $t(opt.label) }}
          </button>
        </div>
      </div>

      <div class="all-fav-scroll">
        <div v-if="chatStore.allFavoritesLoading" class="all-fav-empty">
          {{ $t('chat.favorites.loading') }}
        </div>
        <div v-else-if="chatStore.allFavorites.length === 0" class="all-fav-empty">
          {{ $t('chat.favorites.emptyAll') }}
        </div>
        <div v-else-if="groups.length === 0" class="all-fav-empty">
          {{ $t('chat.favorites.noResult') }}
        </div>

        <template v-else>
          <section v-for="group in groups" :key="group.conversationId" class="fav-group">
            <header class="fav-group-header">
              <div class="fav-group-title-wrap">
                <FolderOutlined class="fav-group-icon" />
                <span class="fav-group-title" :title="group.conversationTitle">{{ group.conversationTitle }}</span>
                <span class="fav-group-count">{{ group.favorites.length }}</span>
              </div>
              <span class="fav-group-time">{{ formatTime(group.latestAt) }}</span>
            </header>

            <div class="fav-group-grid">
              <article
                v-for="fav in group.favorites"
                :key="fav.id"
                class="all-fav-card"
                @click="emit('jump', fav.conversationId, fav.messageId)"
              >
                <div class="all-fav-card-top">
                  <span class="all-fav-type" :class="fav.type">
                    {{ fav.type === 'query' ? $t('chat.favorites.typeQuery') : $t('chat.favorites.typeResp') }}
                  </span>
                  <span class="all-fav-time">{{ formatTime(fav.createdAt) }}</span>
                  <button
                    class="all-fav-remove"
                    :title="$t('chat.favorites.remove')"
                    @click.stop="chatStore.removeFavorite(fav.id, fav.conversationId)"
                  >
                    <StarFilled />
                  </button>
                </div>

                <div v-if="fav.referenceImages && fav.referenceImages.length > 0" class="all-fav-refs" @click.stop>
                  <img
                    v-for="ref in fav.referenceImages.slice(0, 4)"
                    :key="ref.id"
                    :src="thumbUrl(ref.url, 96)"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    @click="emit('preview', ref.url)"
                  />
                </div>

                <p class="all-fav-text">{{ fav.text }}</p>

                <div v-if="fav.images && fav.images.length > 0" class="all-fav-thumbs" @click.stop>
                  <img
                    v-for="url in fav.images.slice(0, 4)"
                    :key="url"
                    :src="thumbUrl(url, 160)"
                    loading="lazy"
                    decoding="async"
                    alt=""
                    @click="emit('preview', url)"
                  />
                  <span v-if="fav.images.length > 4" class="all-fav-more">+{{ fav.images.length - 4 }}</span>
                </div>

                <div class="all-fav-actions" @click.stop>
                  <button @click="emit('jump', fav.conversationId, fav.messageId)">
                    <AimOutlined /> {{ $t('chat.favorites.jump') }}
                  </button>
                  <button @click="copy(fav.text)">
                    <CopyOutlined /> {{ $t('chat.favorites.copy') }}
                  </button>
                </div>
              </article>
            </div>
          </section>
        </template>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { StarFilled, FolderOutlined, AimOutlined, CopyOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { thumbUrl } from '@/lib/image'
import type { AllFavoriteEntry } from '@/types'

type Filter = 'all' | 'query' | 'resp'

interface FavoriteGroup {
  conversationId: string
  conversationTitle: string
  latestAt: number
  favorites: AllFavoriteEntry[]
}

const emit = defineEmits<{
  jump: [conversationId: string, messageId: string]
  preview: [url: string]
}>()

const chatStore = useChatStore()
const { t } = useI18n()

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'chat.favorites.filterAll' },
  { value: 'query', label: 'chat.favorites.filterQuery' },
  { value: 'resp', label: 'chat.favorites.filterResp' },
]

const keyword = ref('')
const filter = ref<Filter>('all')

const groups = computed<FavoriteGroup[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  const byConversation = new Map<string, FavoriteGroup>()

  for (const favorite of chatStore.allFavorites) {
    if (filter.value !== 'all' && favorite.type !== filter.value) continue
    if (kw && !favorite.text.toLowerCase().includes(kw) && !favorite.conversationTitle.toLowerCase().includes(kw)) {
      continue
    }

    let group = byConversation.get(favorite.conversationId)
    if (!group) {
      group = {
        conversationId: favorite.conversationId,
        conversationTitle: favorite.conversationTitle,
        latestAt: favorite.createdAt,
        favorites: [],
      }
      byConversation.set(favorite.conversationId, group)
    }
    group.favorites.push(favorite)
    group.latestAt = Math.max(group.latestAt, favorite.createdAt)
  }

  return [...byConversation.values()]
    .map(group => ({
      ...group,
      favorites: group.favorites.sort((a, b) => b.createdAt - a.createdAt),
    }))
    .sort((a, b) => b.latestAt - a.latestAt)
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
:global(.all-favorites-modal .ant-modal) {
  max-width: calc(100vw - 32px);
  padding-bottom: 0;
}

:global(.all-favorites-modal .ant-modal-content) {
  overflow: hidden;
  border: 1px solid var(--sider-border);
  border-radius: 16px;
  background: var(--sider-bg);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.24);
}

:global(.all-favorites-modal .ant-modal-header) {
  margin: 0;
  padding: 16px 20px;
  border-bottom: 1px solid var(--sider-border);
  background: transparent;
}

:global(.all-favorites-modal .ant-modal-body) {
  padding: 0;
}

.all-fav-modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sider-text);
  font-size: 16px;
  font-weight: 650;
}

.all-fav-modal-title > :first-child {
  color: #faad14;
}

.all-fav-total {
  min-width: 22px;
  height: 20px;
  padding: 0 7px;
  border-radius: 10px;
  background: rgba(250, 173, 20, 0.14);
  color: #d48806;
  font-size: 12px;
  line-height: 20px;
  text-align: center;
}

.all-fav-shell {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 150px);
}

.all-fav-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--sider-border);
}

.all-fav-search {
  flex: 1;
  min-width: 220px;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid var(--sider-border);
  border-radius: 9px;
  background: transparent;
  color: var(--sider-text);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.all-fav-search::placeholder {
  color: var(--sider-faint);
}

.all-fav-search:focus {
  border-color: var(--sider-icon);
}

.all-fav-filters {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.all-fav-filter {
  padding: 6px 12px;
  border: 1px solid var(--sider-border);
  border-radius: 999px;
  background: transparent;
  color: var(--sider-icon);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.all-fav-filter:hover {
  color: var(--sider-text);
}

.all-fav-filter.active {
  border-color: transparent;
  background: var(--sider-item-active);
  color: var(--sider-item-active-text, var(--sider-text));
  font-weight: 650;
}

.all-fav-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 24px;
}

.all-fav-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  color: var(--sider-faint);
  font-size: 14px;
}

.fav-group {
  margin-bottom: 24px;
}

.fav-group:last-child {
  margin-bottom: 0;
}

.fav-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 10px;
  padding: 0 2px;
}

.fav-group-title-wrap {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 7px;
}

.fav-group-icon {
  flex-shrink: 0;
  color: var(--sider-icon);
  font-size: 13px;
}

.fav-group-title {
  overflow: hidden;
  color: var(--sider-text);
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fav-group-count {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--sider-item-active);
  color: var(--sider-item-active-text, var(--sider-text));
  font-size: 11px;
}

.fav-group-time {
  flex-shrink: 0;
  color: var(--sider-faint);
  font-size: 11px;
}

.fav-group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 10px;
}

.all-fav-card {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--queuecard-border, var(--sider-border));
  border-radius: 12px;
  background: var(--queuecard-bg, transparent);
  box-shadow: var(--queuecard-shadow, none);
  backdrop-filter: var(--queuecard-blur, none);
  -webkit-backdrop-filter: var(--queuecard-blur, none);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.15s;
}

.all-fav-card:hover {
  border-color: var(--sider-icon);
  background: var(--queuecard-hover-bg, var(--sider-item-hover));
  transform: translateY(-1px);
}

.all-fav-card-top {
  display: flex;
  align-items: center;
  gap: 7px;
}

.all-fav-type {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(22, 119, 255, 0.14);
  color: #1677ff;
  font-size: 11px;
  line-height: 17px;
}

.all-fav-type.resp {
  background: rgba(82, 196, 26, 0.16);
  color: #389e0d;
}

.all-fav-time {
  color: var(--sider-faint);
  font-size: 11px;
}

.all-fav-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: auto;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #faad14;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.all-fav-remove:hover {
  background: var(--sider-item-hover);
  color: #ff4d4f;
}

.all-fav-refs,
.all-fav-thumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
}

.all-fav-refs img {
  width: 42px;
  height: 42px;
  border: 1px solid var(--sider-border);
  border-radius: 7px;
  object-fit: cover;
  cursor: zoom-in;
}

.all-fav-thumbs img {
  width: 66px;
  height: 66px;
  border: 1px solid var(--sider-border);
  border-radius: 8px;
  object-fit: cover;
  cursor: zoom-in;
}

.all-fav-more {
  color: var(--sider-faint);
  font-size: 12px;
}

.all-fav-text {
  display: -webkit-box;
  overflow: hidden;
  margin: 8px 0 0;
  color: var(--sider-text);
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}

.all-fav-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.all-fav-actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 9px;
  border: 1px solid var(--sider-border);
  border-radius: 7px;
  background: transparent;
  color: var(--sider-icon);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.all-fav-actions button:hover {
  border-color: var(--sider-icon);
  color: var(--sider-text);
}

@media (max-width: 720px) {
  .all-fav-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .all-fav-search {
    min-width: 0;
  }

  .all-fav-filters {
    align-self: flex-start;
  }

  .fav-group-grid {
    grid-template-columns: 1fr;
  }
}
</style>
