<template>
  <div v-if="settingsStore.settingsOpen" class="settings-overlay" @keydown.esc="close">
    <div class="settings-header">
      <span class="settings-title">设置</span>
      <button class="settings-close" title="关闭" @click="close">
        <CloseOutlined />
      </button>
    </div>
    <div class="settings-body">
      <nav class="settings-nav">
        <div
          v-for="item in NAV_ITEMS"
          :key="item.key"
          class="nav-item"
          :class="{ active: section === item.key }"
          @click="section = item.key"
        >
          <component :is="item.icon" class="nav-icon" />
          <span>{{ item.label }}</span>
        </div>
      </nav>
      <div class="settings-content">
        <template v-if="section === 'providers'">
          <SettingsProviderList :selected-id="editingProviderId" @select="editingProviderId = $event" />
          <SettingsProviderForm v-if="editingProviderId" :key="editingProviderId" :provider-id="editingProviderId" />
          <div v-else class="form-empty">请选择或添加一个供应商</div>
        </template>
        <div v-else class="ai-chat-form">
          <div class="form-title">AI 总结</div>
          <p class="form-tip">用于会话标题的「AI 总结」功能（可选），任意 OpenAI 兼容接口。</p>
          <div class="form-item">
            <div class="form-label">API 密钥</div>
            <a-input-password v-model:value="aiChatDraft.apiKey" placeholder="sk-..." @blur="saveAiChat" />
          </div>
          <div class="form-item">
            <div class="form-label">API 地址</div>
            <a-input v-model:value="aiChatDraft.baseUrl" placeholder="https://api.openai.com/v1" @blur="saveAiChat" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, markRaw } from 'vue'
import { CloseOutlined, CloudOutlined, RobotOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { useSettingsStore } from '@/stores/settings'
import SettingsProviderList from './SettingsProviderList.vue'
import SettingsProviderForm from './SettingsProviderForm.vue'

const NAV_ITEMS = [
  { key: 'providers', label: '模型服务', icon: markRaw(CloudOutlined) },
  { key: 'aiChat', label: 'AI 总结', icon: markRaw(RobotOutlined) },
] as const

type SectionKey = (typeof NAV_ITEMS)[number]['key']

const settingsStore = useSettingsStore()
const section = ref<SectionKey>('providers')
const editingProviderId = ref('')
const aiChatDraft = ref({ apiKey: '', baseUrl: '' })

// (Re)initialize drafts each time the settings page opens
watch(
  () => settingsStore.settingsOpen,
  open => {
    if (!open) return
    editingProviderId.value = settingsStore.providers[0]?.id || ''
    aiChatDraft.value = {
      apiKey: settingsStore.config.aiChat.apiKey,
      baseUrl: settingsStore.config.aiChat.baseUrl,
    }
  },
  { immediate: true },
)

function close() {
  settingsStore.settingsOpen = false
}

async function saveAiChat() {
  try {
    await settingsStore.saveAiChat(aiChatDraft.value.apiKey.trim(), aiChatDraft.value.baseUrl.trim())
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || '保存失败')
  }
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  background: var(--page-bg);
  color: var(--text-primary);
}

.settings-header {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--header-border);
  background: var(--header-bg);
}

.settings-title {
  font-size: 15px;
  font-weight: 600;
}

.settings-close {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--header-text);
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.settings-close:hover {
  background: var(--toolbtn-hover-bg, rgba(0, 0, 0, 0.06));
}

.settings-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.settings-nav {
  width: 168px;
  flex-shrink: 0;
  padding: 12px 8px;
  border-right: 1px solid var(--sider-border);
  background: var(--sider-bg);
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--sider-text);
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.nav-item:hover {
  background: var(--sider-item-hover);
}

.nav-item.active {
  background: var(--sider-item-active);
  color: var(--sider-item-active-text);
  font-weight: var(--sider-active-weight);
}

.nav-icon {
  font-size: 14px;
  color: var(--sider-icon);
}

.settings-content {
  flex: 1;
  display: flex;
  min-width: 0;
  min-height: 0;
}

.form-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  font-size: 14px;
}

.ai-chat-form {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  max-width: 560px;
}

.form-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.form-tip {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.form-item {
  margin-bottom: 16px;
}

.form-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
</style>
