<template>
  <div v-if="settingsStore.settingsOpen" class="settings-overlay" @keydown.esc="close">
    <div class="settings-header">
      <span class="settings-title">{{ $t('settings.title') }}</span>
      <button class="settings-close" :title="$t('common.close')" @click="close">
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
          <span>{{ $t(`settings.nav.${item.key}`) }}</span>
        </div>
      </nav>
      <div class="settings-content">
        <div v-if="section === 'general'" class="general-form">
          <div class="form-title">{{ $t('settings.nav.general') }}</div>
          <div class="form-item">
            <div class="form-label">{{ $t('settings.general.language') }}</div>
            <a-radio-group
              :value="localePreference"
              button-style="solid"
              @change="(e: any) => setLocale(e.target.value)"
            >
              <a-radio-button value="auto">{{ $t('settings.general.auto') }}</a-radio-button>
              <a-radio-button value="zh-CN">{{ $t('settings.general.zhCN') }}</a-radio-button>
              <a-radio-button value="en-US">{{ $t('settings.general.enUS') }}</a-radio-button>
            </a-radio-group>
          </div>
        </div>
        <template v-else-if="section === 'providers'">
          <SettingsProviderList :selected-id="editingProviderId" @select="editingProviderId = $event" />
          <SettingsProviderForm v-if="editingProviderId" :key="editingProviderId" :provider-id="editingProviderId" />
          <div v-else class="form-empty">{{ $t('settings.providers.empty') }}</div>
        </template>
        <div v-else class="ai-chat-form">
          <div class="form-title">{{ $t('settings.aiChat.title') }}</div>
          <p class="form-tip">{{ $t('settings.aiChat.tip') }}</p>
          <div class="form-item">
            <div class="form-label">{{ $t('settings.aiChat.apiKey') }}</div>
            <a-input-password v-model:value="aiChatDraft.apiKey" placeholder="sk-..." @blur="saveAiChat" />
          </div>
          <div class="form-item">
            <div class="form-label">{{ $t('settings.aiChat.baseUrl') }}</div>
            <a-input v-model:value="aiChatDraft.baseUrl" placeholder="https://api.openai.com/v1" @blur="saveAiChat" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, markRaw } from 'vue'
import { CloseOutlined, CloudOutlined, GlobalOutlined, RobotOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { useSettingsStore } from '@/stores/settings'
import { localePreference, setLocale } from '@/i18n'
import { useI18n } from 'vue-i18n'
import SettingsProviderList from './SettingsProviderList.vue'
import SettingsProviderForm from './SettingsProviderForm.vue'

const NAV_ITEMS = [
  { key: 'general', icon: markRaw(GlobalOutlined) },
  { key: 'providers', icon: markRaw(CloudOutlined) },
  { key: 'aiChat', icon: markRaw(RobotOutlined) },
] as const

type SectionKey = (typeof NAV_ITEMS)[number]['key']

const settingsStore = useSettingsStore()
const { t } = useI18n()
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
    message.error(e.response?.data?.error || e.message || t('errors.saveFailed'))
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

.ai-chat-form,
.general-form {
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
