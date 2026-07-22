<template>
  <a-modal
    :open="visible"
    :title="$t('welcome.title')"
    :closable="false"
    :keyboard="false"
    :mask-closable="false"
    :footer="null"
    :width="440"
  >
    <p class="welcome-desc">{{ $t('welcome.desc') }}</p>

    <div class="welcome-form">
      <div class="welcome-label">{{ $t('welcome.provider') }}</div>
      <a-select v-model:value="providerId" :options="providerOptions" style="width: 100%;" />
      <div class="welcome-label" style="margin-top: 12px;">{{ $t('welcome.apiKey') }}</div>
      <a-input-password v-model:value="apiKey" placeholder="sk-..." @pressEnter="start" />
    </div>

    <div class="welcome-actions">
      <AppButton size="small" @click="dismiss">{{ $t('welcome.later') }}</AppButton>
      <AppButton size="small" @click="openFullSettings">{{ $t('welcome.fullSettings') }}</AppButton>
      <AppButton size="small" type="primary" :loading="saving" :disabled="!apiKey.trim()" @click="start">
        {{ $t('welcome.start') }}
      </AppButton>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import AppButton from './AppButton.vue'

const settingsStore = useSettingsStore()
const { t } = useI18n()

// 首次启动初始化：配置加载完成且无可用的生图供应商时弹出；
// 「暂不配置」仅本次会话有效——下次启动若仍未配置会再次弹出（生图是硬性前提）
const dismissed = ref(false)
const visible = computed(
  () => settingsStore.loaded && !settingsStore.hasUsableProvider && !dismissed.value,
)

// 只列出有模型的供应商（无模型的供应商填了 Key 也不可用）
const providerOptions = computed(() =>
  settingsStore.providers
    .filter(p => p.models.length > 0)
    .map(p => ({ value: p.id, label: p.name })),
)
const providerId = ref('')
const apiKey = ref('')
const saving = ref(false)

// 默认值在配置加载后填充（modal 可能在 loadConfig 完成前就渲染）
watch(
  () => settingsStore.loaded,
  loaded => {
    if (loaded && !providerId.value) {
      providerId.value =
        settingsStore.providers.find(p => p.id === 'apimart')?.id || providerOptions.value[0]?.value || ''
    }
  },
  { immediate: true },
)

async function start() {
  if (!providerId.value || !apiKey.value.trim()) return
  saving.value = true
  try {
    await settingsStore.updateProvider(providerId.value, { apiKey: apiKey.value.trim() })
    // hasUsableProvider 变为 true 后 visible 自动收起
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || t('errors.saveFailed'))
  } finally {
    saving.value = false
  }
}

function openFullSettings() {
  settingsStore.settingsOpen = true
}

function dismiss() {
  dismissed.value = true
}
</script>

<style scoped>
.welcome-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.welcome-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.welcome-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
</style>
