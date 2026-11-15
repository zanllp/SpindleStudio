<template>
  <div class="optimizer-list">
    <div
      v-for="o in settingsStore.optimizers"
      :key="o.id"
      class="optimizer-item"
      :class="{ active: o.id === selectedId }"
      @click="emit('select', o.id)"
    >
      <span class="optimizer-avatar">{{ (o.name || o.prompt || '?').slice(0, 1).toUpperCase() }}</span>
      <span class="optimizer-name" :title="o.name || o.prompt">{{ o.name || $t('settings.optimizers.untitled') }}</span>
      <a-popconfirm
        :title="$t('settings.optimizers.deleteConfirm')"
        :ok-text="$t('common.delete')"
        :cancel-text="$t('common.cancel')"
        @confirm="remove(o.id)"
      >
        <DeleteOutlined class="optimizer-delete" @click.stop />
      </a-popconfirm>
    </div>
    <button class="add-optimizer-btn" @click="handleAdd">
      <PlusOutlined />
      <span>{{ $t('settings.optimizers.add') }}</span>
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
    await settingsStore.removeOptimizer(id)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || t('errors.deleteFailed'))
  }
}

async function handleAdd() {
  try {
    const optimizer = await settingsStore.addOptimizer()
    emit('select', optimizer.id)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || t('errors.addFailed'))
  }
}
</script>

<style scoped>
.optimizer-list {
  width: 240px;
  flex-shrink: 0;
  padding: 12px;
  border-right: 1px solid var(--sider-border);
  background: var(--sider-bg);
  overflow-y: auto;
}

.optimizer-item {
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

.optimizer-item:hover {
  background: var(--sider-item-hover);
}

.optimizer-item.active {
  background: var(--sider-item-active);
}

.optimizer-avatar {
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

.optimizer-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--sider-text);
}

.optimizer-delete {
  color: var(--sider-icon);
  font-size: 13px;
}

.optimizer-delete:hover {
  color: #ff4d4f;
}

.add-optimizer-btn {
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

.add-optimizer-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}
</style>
