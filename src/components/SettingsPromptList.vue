<template>
  <div class="snippet-list">
    <div
      v-for="s in settingsStore.promptSnippets"
      :key="s.id"
      class="snippet-item"
      :class="{ active: s.id === selectedId }"
      @click="emit('select', s.id)"
    >
      <span class="snippet-avatar">{{ (s.title || s.prompt || '?').slice(0, 1).toUpperCase() }}</span>
      <span class="snippet-name" :title="s.title || s.prompt">{{ s.title || $t('settings.prompts.untitled') }}</span>
      <a-popconfirm
        :title="$t('settings.prompts.deleteConfirm')"
        :ok-text="$t('common.delete')"
        :cancel-text="$t('common.cancel')"
        @confirm="remove(s.id)"
      >
        <DeleteOutlined class="snippet-delete" @click.stop />
      </a-popconfirm>
    </div>
    <button class="add-snippet-btn" @click="handleAdd">
      <PlusOutlined />
      <span>{{ $t('settings.prompts.add') }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'

defineProps<{ selectedId: string }>()
const emit = defineEmits<{ select: [id: string] }>()

const settingsStore = useSettingsStore()
const { t } = useI18n()

async function remove(id: string) {
  try {
    await settingsStore.removePromptSnippet(id)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || t('errors.deleteFailed'))
  }
}

async function handleAdd() {
  try {
    const snippet = await settingsStore.addPromptSnippet()
    emit('select', snippet.id)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || t('errors.addFailed'))
  }
}
</script>

<style scoped>
.snippet-list {
  width: 240px;
  flex-shrink: 0;
  padding: 12px;
  border-right: 1px solid var(--sider-border);
  background: var(--sider-bg);
  overflow-y: auto;
}

.snippet-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.snippet-item:hover {
  background: var(--sider-item-hover);
}

.snippet-item.active {
  background: var(--sider-item-active);
}

.snippet-avatar {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--send-bg);
  color: var(--send-text);
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.snippet-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--sider-text);
}

.snippet-delete {
  color: var(--sider-icon);
  font-size: 13px;
}

.snippet-delete:hover {
  color: #ff4d4f;
}

.add-snippet-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 8px;
  padding: 8px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.add-snippet-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}
</style>
