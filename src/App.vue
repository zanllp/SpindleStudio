<template>
  <div id="app">
    <a-config-provider :theme="themeStore.antdTheme" :locale="antdLocale">
      <a-layout style="min-height: 100vh">
        <a-layout-header class="app-header">
          <span class="app-title">SpindleStudio</span>
          <span
            v-if="chatStore.activeConversation"
            class="active-conv-title"
            :title="chatStore.activeConversation.title"
          >{{ chatStore.activeConversation.title }}</span>
          <div class="header-right">
            <a-tooltip :title="$t('common.openInBrowser')">
              <span class="header-icon" @click="openInBrowser"><GlobalOutlined /></span>
            </a-tooltip>
            <a-select
              :value="themeStore.themeId"
              :options="THEME_OPTIONS"
              :bordered="false"
              size="small"
              class="theme-select"
              @change="(id: ThemeId) => themeStore.setTheme(id)"
            >
              <template #suffixIcon>
                <BgColorsOutlined />
              </template>
            </a-select>
          </div>
        </a-layout-header>

        <div class="chat-container">
          <ChatPanel />
        </div>

        <WelcomeModal />
        <SettingsView />
      </a-layout>
    </a-config-provider>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { BgColorsOutlined, GlobalOutlined } from '@ant-design/icons-vue'
import ChatPanel from '@/components/ChatPanel.vue'
import SettingsView from '@/components/SettingsView.vue'
import WelcomeModal from '@/components/WelcomeModal.vue'
import { useThemeStore, THEME_OPTIONS, type ThemeId } from '@/stores/theme'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import { antdLocale } from '@/i18n'
import { onSync } from '@/lib/sync'

const themeStore = useThemeStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()

// 多窗口：?conv=<id> 让窗口直达指定会话（缺省打开最近会话）
function initialConversationId(): string | null {
  const id = new URLSearchParams(window.location.search).get('conv')
  return id && chatStore.conversationList.some(c => c.id === id) ? id : null
}

// 在系统浏览器中打开
// Electron: feature "external" → main.cjs 的 setWindowOpenHandler 调 shell.openExternal
// 浏览器: window.open 直接开新标签页，浏览器忽略不识别的 feature
function openInBrowser() {
  const convId = chatStore.activeConversationId
  const url = convId ? `${window.location.origin}/?conv=${convId}` : window.location.origin
  window.open(url, '_blank', 'external')
}

// 窗口标题跟随会话，多窗口切换（任务栏/alt-tab）时可辨
watch(
  () => chatStore.activeConversation?.title,
  title => {
    document.title = title ? `${title} - SpindleStudio` : 'SpindleStudio'
  },
  { immediate: true },
)

// URL 跟随当前选中会话：切换侧栏时 replaceState 更新 ?conv=，刷新/复制链接能还原
watch(
  () => chatStore.activeConversationId,
  id => {
    const url = id
      ? `${window.location.pathname}?conv=${id}`
      : window.location.pathname
    window.history.replaceState(null, '', url)
  },
)

// 跨窗口/标签页实时同步：BroadcastChannel 推送 → 刷新侧栏或重新加载当前会话
onSync({
  onConversationsChanged: () => chatStore.loadConversations(),
  onConversationUpdated: (id) => chatStore.maybeReloadConversation(id),
})

onMounted(async () => {
  await settingsStore.loadConfig()
  await chatStore.loadConversations()
  const target = initialConversationId() || chatStore.conversationList[0]?.id
  if (target) {
    await chatStore.selectConversation(target)
  }
  // 无可用生图供应商时由 WelcomeModal 引导初始化（见其 visible 逻辑）
})
</script>

<style>
#app {
  font-family: var(--font-family);
}

body {
  margin: 0;
  padding: 0;
}

/* 提高特异性，覆盖 antd 默认的深色 header */
.ant-layout-header.app-header {
  height: 48px;
  line-height: 48px;
  padding: 0 16px;
  background: var(--header-bg);
  border-bottom: 1px solid var(--header-border);
  backdrop-filter: var(--header-blur);
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 100;
}

.app-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--header-text);
  flex-shrink: 0;
}

/* 顶栏中央：当前选中会话的标题（多窗口时每窗口显示各自选中的会话） */
.active-conv-title {
  flex: 1;
  min-width: 0;
  margin-left: 14px;
  font-size: 14px;
  color: var(--header-text);
  opacity: 0.72;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 顶栏图标按钮（浏览器打开等），弱化成文本级控件 */
.header-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--header-text);
  opacity: 0.66;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
}
.header-icon:hover {
  opacity: 1;
  background: var(--item-hover-bg, rgba(128, 128, 128, 0.12));
}

.chat-container {
  height: calc(100vh - 48px);
}

/* 主题切换：无边框弱化成文本级控件，颜色跟随顶栏。
   antd-vue 4 的 CSS-in-JS 把 color 直接打在 selection-item 上，必须 !important 压过 */
.theme-select {
  min-width: 118px;
}

.theme-select .ant-select-selection-item,
.theme-select .ant-select-arrow,
.theme-select .anticon {
  color: var(--header-text) !important;
}
</style>
