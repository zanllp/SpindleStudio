<template>
  <div v-if="snippet" class="snippet-form">
    <div class="form-header">
      <span class="form-title">{{ snippet.title || $t('settings.prompts.untitled') }}</span>
    </div>
    <div class="form-item">
      <div class="form-label">{{ $t('settings.prompts.form.title') }}</div>
      <a-input
        v-model:value="draft.title"
        :placeholder="$t('settings.prompts.form.titlePlaceholder')"
        @blur="save({ title: draft.title.trim() })"
      />
    </div>
    <div class="form-item">
      <div class="form-label">{{ $t('settings.prompts.form.prompt') }}</div>
      <a-textarea
        v-model:value="draft.prompt"
        :auto-size="{ minRows: 6, maxRows: 16 }"
        :placeholder="$t('settings.prompts.form.promptPlaceholder')"
        @blur="save({ prompt: draft.prompt })"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{ snippetId: string }>()

const settingsStore = useSettingsStore()
const { t } = useI18n()
const snippet = computed(() => settingsStore.promptSnippets.find(s => s.id === props.snippetId))

// 本地草稿：输入过程不落盘，blur 时保存
const draft = ref({ title: '', prompt: '' })
if (snippet.value) {
  draft.value = {
    title: snippet.value.title,
    prompt: snippet.value.prompt,
  }
}

async function save(patch: { title?: string; prompt?: string }) {
  // 内容没变就不发请求（blur 必触发，避免无意义写盘与广播）
  if (patch.title !== undefined && patch.title === snippet.value?.title) return
  if (patch.prompt !== undefined && patch.prompt === snippet.value?.prompt) return
  try {
    await settingsStore.updatePromptSnippet(props.snippetId, patch)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || t('errors.saveFailed'))
  }
}
</script>

<style scoped>
.snippet-form {
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

.form-item {
  margin-bottom: 16px;
}

.form-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}
</style>
