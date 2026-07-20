<template>
  <div id="app">
    <a-config-provider :theme="themeStore.antdTheme">
      <a-layout style="min-height: 100vh">
        <a-layout-header class="app-header">
          <span class="app-title">GPT Image Chat</span>
          <div class="header-right">
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

        <SettingsView />
      </a-layout>
    </a-config-provider>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { BgColorsOutlined } from '@ant-design/icons-vue'
import ChatPanel from '@/components/ChatPanel.vue'
import SettingsView from '@/components/SettingsView.vue'
import { useThemeStore, THEME_OPTIONS, type ThemeId } from '@/stores/theme'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'

const themeStore = useThemeStore()
const chatStore = useChatStore()
const settingsStore = useSettingsStore()

onMounted(async () => {
  await settingsStore.loadConfig()
  await chatStore.loadConversations()
  // 打开最近的对话
  const target = chatStore.conversationList[0]
  if (target) {
    await chatStore.selectConversation(target.id)
  }
  // 首次使用没有可用生图供应商时直接打开设置页
  if (!settingsStore.hasUsableProvider) {
    settingsStore.settingsOpen = true
  }
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
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-container {
  height: calc(100vh - 48px);
}

/* 主题切换：无边框弱化成文本级控件，颜色跟随顶栏 */
.theme-select {
  min-width: 118px;
}

.theme-select :deep(.ant-select-selection-item),
.theme-select :deep(.ant-select-arrow) {
  color: var(--header-text);
}
</style>
