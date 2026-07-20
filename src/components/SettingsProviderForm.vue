<template>
  <div v-if="provider" class="provider-form">
    <div class="form-header">
      <span class="form-title">{{ provider.name }}</span>
      <span class="form-type">{{ TYPE_LABELS[provider.type] }}</span>
    </div>

    <div v-if="provider.custom" class="form-item">
      <div class="form-label">名称</div>
      <a-input v-model:value="draft.name" @blur="save({ name: draft.name.trim() || provider.name })" />
    </div>
    <div class="form-item">
      <div class="form-label">API 密钥</div>
      <a-input-password v-model:value="draft.apiKey" placeholder="sk-..." @blur="save({ apiKey: draft.apiKey.trim() })" />
    </div>
    <div class="form-item">
      <div class="form-label">API 地址</div>
      <a-input v-model:value="draft.baseUrl" @blur="save({ baseUrl: draft.baseUrl.trim() })" />
    </div>
    <div class="form-item">
      <div class="form-label">模型</div>
      <ModelListEditor :models="provider.models" @update:models="save({ models: $event })" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { useSettingsStore } from '@/stores/settings'
import type { ProviderType } from '@/types'
import ModelListEditor from './ModelListEditor.vue'

const TYPE_LABELS: Record<ProviderType, string> = {
  'apimart-task': '异步任务模式',
  'openai-images': 'OpenAI 兼容',
}

const props = defineProps<{ providerId: string }>()

const settingsStore = useSettingsStore()
const provider = computed(() => settingsStore.getProvider(props.providerId))

// 本地草稿：输入过程不落盘，blur 时保存
const draft = ref({ name: '', apiKey: '', baseUrl: '' })
if (provider.value) {
  draft.value = {
    name: provider.value.name,
    apiKey: provider.value.apiKey,
    baseUrl: provider.value.baseUrl,
  }
}

async function save(patch: Parameters<typeof settingsStore.updateProvider>[1]) {
  try {
    await settingsStore.updateProvider(props.providerId, patch)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || '保存失败')
  }
}
</script>

<style scoped>
.provider-form {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  max-width: 560px;
}

.form-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 20px;
}

.form-title {
  font-size: 16px;
  font-weight: 600;
}

.form-type {
  font-size: 12px;
  color: var(--text-faint);
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
