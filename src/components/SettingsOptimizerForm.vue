<template>
  <div v-if="optimizer" class="optimizer-form">
    <div class="form-header">
      <span class="form-title">{{ optimizer.name || $t('settings.optimizers.untitled') }}</span>
    </div>
    <p class="form-tip">{{ $t('settings.optimizers.tip') }}</p>
    <div class="form-item">
      <div class="form-label">{{ $t('settings.optimizers.form.name') }}</div>
      <a-input
        v-model:value="draft.name"
        :placeholder="$t('settings.optimizers.form.namePlaceholder')"
        @blur="save({ name: draft.name.trim() })"
      />
    </div>
    <div class="form-item">
      <div class="form-label">{{ $t('settings.optimizers.form.prompt') }}</div>
      <a-textarea
        v-model:value="draft.prompt"
        :auto-size="{ minRows: 10, maxRows: 24 }"
        :placeholder="$t('settings.optimizers.form.promptPlaceholder')"
        @blur="save({ prompt: draft.prompt })"
      />
    </div>
    <p class="form-tip">{{ $t('settings.optimizers.modelHint', { model: aiModel }) }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{ optimizerId: string }>()

const settingsStore = useSettingsStore()
const { t } = useI18n()
const optimizer = computed(() => settingsStore.optimizers.find(o => o.id === props.optimizerId))
const aiModel = computed(() => settingsStore.config.aiChat.model || t('settings.optimizers.modelUnset'))

// 本地草稿：输入过程不落盘，blur 时保存
const draft = ref({ name: '', prompt: '' })
if (optimizer.value) {
  draft.value = {
    name: optimizer.value.name,
    prompt: optimizer.value.prompt,
  }
}

async function save(patch: { name?: string; prompt?: string }) {
  // 内容没变就不发请求（blur 必触发，避免无意义写盘与广播）
  if (patch.name !== undefined && patch.name === optimizer.value?.name) return
  if (patch.prompt !== undefined && patch.prompt === optimizer.value?.prompt) return
  try {
    await settingsStore.updateOptimizer(props.optimizerId, patch)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || t('errors.saveFailed'))
  }
}
</script>

<style scoped>
.optimizer-form {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  max-width: 560px;
}

.form-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 16px;
}

.form-title {
  font-size: 16px;
  font-weight: 600;
}

.form-tip {
  margin: 0 0 16px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.7;
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
