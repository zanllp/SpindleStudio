<template>
  <div class="conversation-sidebar">
    <button class="new-chat-btn" @click="handleCreate">
      <PlusOutlined />
      <span>{{ $t('common.newConversation') }}</span>
    </button>

    <div class="conversation-count-row">
      <span>{{ $t('sidebar.conversations') }}</span>
      <span class="conversation-count-value">{{ chatStore.conversationList.length }}</span>
    </div>

    <div class="list-scroll" @scroll="closeContextMenu">
      <a-spin :spinning="chatStore.isLoadingList" style="width: 100%;">
        <div v-if="chatStore.activeConversationList.length === 0" class="empty-tip">
          {{ chatStore.autoCollapsedConversationList.length + chatStore.archivedConversationList.length > 0 ? $t('sidebar.noActive') : $t('sidebar.empty') }}
        </div>
        <div
          v-for="conv in chatStore.activeConversationList"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: conv.id === chatStore.activeConversationId }"
          @click="chatStore.selectConversation(conv.id)"
          @contextmenu.prevent.stop="openContextMenu($event, conv)"
        >
          <PushpinFilled v-if="conv.pinned" class="pinned-marker" />
          <span class="conversation-title" :title="conv.title">{{ conv.title }}</span>
          <span
            v-if="conv.turnCount > 0"
            class="conversation-turn-count"
            :title="$t('sidebar.turnPairs', { count: conv.turnCount })"
          >{{ conv.turnCount }}</span>
          <button
            class="conversation-more"
            :title="$t('sidebar.moreActions')"
            @click.stop="openContextMenu($event, conv)"
            @contextmenu.prevent.stop="openContextMenu($event, conv)"
          >
            <MoreOutlined />
          </button>
        </div>
      </a-spin>

      <section v-if="chatStore.autoCollapsedConversationList.length > 0" class="archive-section auto-collapsed-section">
        <button class="archive-toggle" @click="autoCollapsedExpanded = !autoCollapsedExpanded">
          <CaretRightOutlined class="archive-caret" :class="{ expanded: autoCollapsedExpanded }" />
          <span>{{ $t('sidebar.autoCollapsed') }}</span>
          <span class="archive-count">{{ chatStore.autoCollapsedConversationList.length }}</span>
        </button>
        <div v-if="autoCollapsedExpanded" class="archive-list">
          <div
            v-for="conv in chatStore.autoCollapsedConversationList"
            :key="conv.id"
            class="conversation-item archived-item"
            :class="{ active: conv.id === chatStore.activeConversationId }"
            @click="chatStore.selectConversation(conv.id)"
            @contextmenu.prevent.stop="openContextMenu($event, conv)"
          >
            <PushpinFilled v-if="conv.pinned" class="pinned-marker" />
            <span class="conversation-title" :title="conv.title">{{ conv.title }}</span>
            <span
              v-if="conv.turnCount > 0"
              class="conversation-turn-count"
              :title="$t('sidebar.turnPairs', { count: conv.turnCount })"
            >{{ conv.turnCount }}</span>
            <button
              class="conversation-more"
              :title="$t('sidebar.moreActions')"
              @click.stop="openContextMenu($event, conv)"
              @contextmenu.prevent.stop="openContextMenu($event, conv)"
            >
              <MoreOutlined />
            </button>
          </div>
        </div>
      </section>

      <section v-if="chatStore.archivedConversationList.length > 0" class="archive-section">
        <button class="archive-toggle" @click="archivedExpanded = !archivedExpanded">
          <CaretRightOutlined class="archive-caret" :class="{ expanded: archivedExpanded }" />
          <span>{{ $t('sidebar.archived') }}</span>
          <span class="archive-count">{{ chatStore.archivedConversationList.length }}</span>
        </button>
        <div v-if="archivedExpanded" class="archive-list">
          <div
            v-for="conv in chatStore.archivedConversationList"
            :key="conv.id"
            class="conversation-item archived-item"
            :class="{ active: conv.id === chatStore.activeConversationId }"
            @click="chatStore.selectConversation(conv.id)"
            @contextmenu.prevent.stop="openContextMenu($event, conv)"
          >
            <PushpinFilled v-if="conv.pinned" class="pinned-marker" />
            <span class="conversation-title" :title="conv.title">{{ conv.title }}</span>
            <span
              v-if="conv.turnCount > 0"
              class="conversation-turn-count"
              :title="$t('sidebar.turnPairs', { count: conv.turnCount })"
            >{{ conv.turnCount }}</span>
            <button
              class="conversation-more"
              :title="$t('sidebar.moreActions')"
              @click.stop="openContextMenu($event, conv)"
              @contextmenu.prevent.stop="openContextMenu($event, conv)"
            >
              <MoreOutlined />
            </button>
          </div>
        </div>
      </section>
    </div>

    <div class="sidebar-footer">
      <button
        class="settings-entry"
        :class="{ active: chatStore.allFavoritesOpen }"
        @click="chatStore.openAllFavorites()"
      >
        <StarOutlined />
        <span>{{ $t('sidebar.favorites') }}</span>
      </button>
      <button class="settings-entry" @click="openNewWindow">
        <WindowsOutlined />
        <span>{{ $t('sidebar.newWindow') }}</span>
      </button>
      <button class="settings-entry" @click="settingsStore.settingsOpen = true">
        <SettingOutlined />
        <span>{{ $t('sidebar.settings') }}</span>
      </button>
    </div>

    <a-modal
      v-model:open="renameModalOpen"
      :title="$t('sidebar.renameTitle')"
      @ok="handleRenameOk"
    >
      <div class="rename-row">
        <a-input v-model:value="renameValue" :placeholder="$t('sidebar.renamePlaceholder')" @pressEnter="handleRenameOk" />
        <a-tooltip :title="$t('sidebar.aiSummarizeTooltip')">
          <AppButton :loading="aiTitleLoading" @click="handleAiSummarize">
            <RobotOutlined />
            {{ $t('sidebar.aiSummarize') }}
          </AppButton>
        </a-tooltip>
      </div>
    </a-modal>

    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="conversation-menu-layer"
        @mousedown="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      >
        <div
          class="conversation-context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @mousedown.stop
          @click.stop
        >
          <button class="context-menu-item" @click="handleMenuAction('pin')">
            <PushpinFilled v-if="contextMenu.conv.pinned" />
            <PushpinOutlined v-else />
            <span>{{ contextMenu.conv.pinned ? $t('sidebar.unpin') : $t('sidebar.pin') }}</span>
          </button>
          <button class="context-menu-item" @click="handleMenuAction('open')">
            <ExportOutlined />
            <span>{{ $t('sidebar.openInNewWindow') }}</span>
          </button>
          <button class="context-menu-item" @click="handleMenuAction('rename')">
            <EditOutlined />
            <span>{{ $t('sidebar.rename') }}</span>
          </button>
          <div class="context-menu-separator" />
          <button class="context-menu-item" @click="handleMenuAction('archive')">
            <InboxOutlined />
            <span>{{ contextMenu.conv.archived ? $t('sidebar.unarchive') : $t('sidebar.archive') }}</span>
          </button>
          <button class="context-menu-item danger" @click="handleMenuAction('delete')">
            <DeleteOutlined />
            <span>{{ $t('common.delete') }}</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  RobotOutlined,
  SettingOutlined,
  ExportOutlined,
  WindowsOutlined,
  StarOutlined,
  PushpinFilled,
  PushpinOutlined,
  MoreOutlined,
  CaretRightOutlined,
  InboxOutlined,
} from '@ant-design/icons-vue'
import { message, Modal } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import AppButton from './AppButton.vue'
import type { ConversationSummary } from '@/types'

type MenuAction = 'pin' | 'open' | 'rename' | 'archive' | 'delete'

interface ContextMenuState {
  conv: ConversationSummary
  x: number
  y: number
}

const MENU_WIDTH = 190
const MENU_HEIGHT = 260

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()

const renameModalOpen = ref(false)
const renameValue = ref('')
const renamingId = ref<string | null>(null)
const aiTitleLoading = ref(false)
const archivedExpanded = ref(false)
const autoCollapsedExpanded = ref(false)
const contextMenu = ref<ContextMenuState | null>(null)

async function handleCreate() {
  await chatStore.createNewConversation()
}

// 多窗口：新窗口直达指定会话（Electron 里开 BrowserWindow，浏览器里开新标签页）
function openInNewWindow(convId: string) {
  window.open(`${window.location.origin}/?conv=${convId}`, '_blank')
}

// 新建窗口：打开当前选中的会话（无选中时退回最近会话，与启动逻辑一致）
function openNewWindow() {
  const convId = chatStore.activeConversationId
  window.open(convId ? `${window.location.origin}/?conv=${convId}` : window.location.origin, '_blank')
}

function openContextMenu(event: MouseEvent, conv: ConversationSummary) {
  const target = event.currentTarget as HTMLElement | null
  const rect = target?.getBoundingClientRect()
  const rawX = event.clientX || rect?.right || 0
  const rawY = event.clientY || rect?.bottom || 0
  contextMenu.value = {
    conv,
    x: Math.max(8, Math.min(rawX, window.innerWidth - MENU_WIDTH - 8)),
    y: Math.max(8, Math.min(rawY, window.innerHeight - MENU_HEIGHT - 8)),
  }
}

function closeContextMenu() {
  contextMenu.value = null
}

function openRename(conv: ConversationSummary) {
  renamingId.value = conv.id
  renameValue.value = conv.title
  renameModalOpen.value = true
}

async function handleRenameOk() {
  if (renamingId.value && renameValue.value.trim()) {
    await chatStore.renameConversation(renamingId.value, renameValue.value)
  }
  renameModalOpen.value = false
}

async function handleMenuAction(action: MenuAction) {
  const state = contextMenu.value
  if (!state) return
  closeContextMenu()
  const conv = state.conv

  if (action === 'pin') {
    await chatStore.toggleConversationPinned(conv.id)
    return
  }
  if (action === 'open') {
    openInNewWindow(conv.id)
    return
  }
  if (action === 'rename') {
    openRename(conv)
    return
  }
  if (action === 'archive') {
    await chatStore.toggleConversationArchived(conv.id)
    if (!conv.archived) archivedExpanded.value = false
    return
  }

  Modal.confirm({
    title: t('sidebar.deleteConfirm'),
    content: conv.title,
    okText: t('common.delete'),
    cancelText: t('common.cancel'),
    okButtonProps: { danger: true },
    onOk: () => chatStore.deleteConversation(conv.id),
  })
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeContextMenu()
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
  window.addEventListener('resize', closeContextMenu)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  window.removeEventListener('resize', closeContextMenu)
})

// AI 总结标题：只提交用户消息，生成后填入输入框，可再编辑后确定
async function handleAiSummarize() {
  if (!renamingId.value) return
  aiTitleLoading.value = true
  try {
    renameValue.value = await chatStore.summarizeTitle(renamingId.value)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || t('errors.aiSummarizeFailed'))
  } finally {
    aiTitleLoading.value = false
  }
}
</script>

<style scoped>
.conversation-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px;
  /* 背景与模糊由外层 .chat-sider 统一绘制，内层保持透明 */
  background: transparent;
}

/* 仅会话列表滚动：头部「新对话」和底部「新建窗口/设置」固定不随列表滚动 */
.conversation-count-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px 7px;
  color: var(--sider-faint);
  font-size: 12px;
}

.conversation-count-value {
  min-width: 22px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--sider-item-active);
  color: var(--sider-item-active-text, var(--sider-text));
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 底部设置入口（Cherry Studio 风格左下角齿轮），固定在侧栏底部 */
.sidebar-footer {
  flex-shrink: 0;
  padding-top: 8px;
  border-top: 1px solid var(--sider-border);
}

.settings-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--sider-text);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.settings-entry:hover,
.settings-entry.active {
  background: var(--sider-item-hover);
}

.settings-entry.active {
  color: var(--sider-item-active-text, var(--sider-text));
  font-weight: 600;
}

/* 新对话：白底描边卡片按钮，比实心主按钮更轻 */
.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  margin-bottom: 10px;
  border: 1px solid var(--newbtn-border);
  border-radius: var(--newbtn-radius);
  background: var(--newbtn-bg);
  color: var(--newbtn-text);
  text-shadow: var(--newbtn-text-shadow);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.new-chat-btn:hover {
  border-color: var(--newbtn-hover-border);
  box-shadow: var(--newbtn-hover-shadow);
}

.empty-tip {
  color: var(--sider-faint);
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}

.conversation-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 34px 8px 10px;
  /* 透明边框占位：玻璃主题选中态要显示描边，避免 1px 位移 */
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.conversation-item:hover {
  background: var(--sider-item-hover);
}

.conversation-item.active {
  background: var(--sider-item-active);
}

.conversation-item.active .conversation-title {
  font-weight: var(--sider-active-weight);
  color: var(--sider-item-active-text);
}

.pinned-marker {
  flex-shrink: 0;
  margin-right: 6px;
  color: #faad14;
  font-size: 11px;
}

.conversation-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--sider-text);
}

.conversation-turn-count {
  position: absolute;
  top: 50%;
  right: 10px;
  min-width: 18px;
  transform: translateY(-50%);
  color: var(--sider-faint);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  line-height: 18px;
  text-align: right;
  white-space: nowrap;
  opacity: 0.72;
  pointer-events: none;
  transition: opacity 0.12s;
}

.conversation-item:hover .conversation-turn-count,
.conversation-item:focus-within .conversation-turn-count {
  opacity: 0;
}

.conversation-more {
  position: absolute;
  top: 50%;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sider-icon);
  font-size: 15px;
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.conversation-item:hover .conversation-more,
.conversation-more:focus-visible {
  opacity: 1;
  pointer-events: auto;
}

.conversation-more:hover {
  background: var(--sider-item-hover);
  color: var(--sider-text);
}

.archive-section {
  margin: 12px 0 4px;
  padding-top: 9px;
  border-top: 1px solid var(--sider-border);
}

.archive-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 8px 9px;
  border: 1px solid var(--sider-border);
  border-radius: 9px;
  background: var(--sider-item-hover);
  color: var(--sider-text);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}

.archive-toggle:hover {
  border-color: var(--sider-icon);
  background: var(--sider-item-active);
  color: var(--sider-text);
}

.archive-caret {
  font-size: 10px;
  transition: transform 0.15s;
}

.archive-caret.expanded {
  transform: rotate(90deg);
}

.archive-count {
  margin-left: auto;
  min-width: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background: var(--sider-item-active);
  color: var(--sider-item-active-text, var(--sider-text));
  line-height: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.archive-list {
  padding-top: 2px;
  opacity: 0.82;
}

.archived-item {
  font-size: 13px;
}

/* 重命名弹窗：输入框 + AI 总结按钮同行 */
.rename-row {
  display: flex;
  gap: 8px;
}

.rename-row .ant-input {
  flex: 1;
}

.conversation-menu-layer {
  position: fixed;
  inset: 0;
  z-index: 2100;
}

.conversation-context-menu {
  position: fixed;
  width: 190px;
  padding: 6px;
  border: 1px solid var(--sider-border);
  border-radius: 10px;
  background: var(--sider-bg);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.22);
  backdrop-filter: var(--sider-blur);
  -webkit-backdrop-filter: var(--sider-blur);
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--sider-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.context-menu-item:hover {
  background: var(--sider-item-hover);
}

.context-menu-item.danger {
  color: #ff4d4f;
}

.context-menu-item.danger:hover {
  background: rgba(255, 77, 79, 0.1);
}

.context-menu-separator {
  height: 1px;
  margin: 5px 4px;
  background: var(--sider-border);
}
</style>
