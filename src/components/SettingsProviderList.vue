<template>
  <div class="provider-list">
    <div
      v-for="p in settingsStore.providers"
      :key="p.id"
      class="provider-item"
      :class="{ active: p.id === selectedId }"
      @click="emit('select', p.id)"
    >
      <span class="provider-avatar">{{ p.name.slice(0, 1).toUpperCase() }}</span>
      <span class="provider-name" :title="p.name">{{ p.name }}</span>
      <a-switch
        :checked="p.enabled"
        size="small"
        @click.stop
        @change="(checked: boolean) => toggle(p.id, checked)"
      />
      <a-popconfirm
        v-if="p.custom"
        title="删除该供应商？"
        ok-text="删除"
        cancel-text="取消"
        @confirm="remove(p.id)"
      >
        <DeleteOutlined class="provider-delete" @click.stop />
      </a-popconfirm>
    </div>
    <button class="add-provider-btn" @click="handleAdd">
      <PlusOutlined />
      <span>添加自定义供应商</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { useSettingsStore } from '@/stores/settings'

defineProps<{ selectedId: string }>()
const emit = defineEmits<{ select: [id: string] }>()

const settingsStore = useSettingsStore()

async function toggle(id: string, enabled: boolean) {
  try {
    await settingsStore.updateProvider(id, { enabled })
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || '保存失败')
  }
}

async function remove(id: string) {
  try {
    await settingsStore.removeProvider(id)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || '删除失败')
  }
}

async function handleAdd() {
  try {
    const provider = await settingsStore.addCustomProvider()
    emit('select', provider.id)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || '添加失败')
  }
}
</script>

<style scoped>
.provider-list {
  width: 240px;
  flex-shrink: 0;
  padding: 12px;
  border-right: 1px solid var(--sider-border);
  overflow-y: auto;
}

.provider-item {
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

.provider-item:hover {
  background: var(--sider-item-hover);
}

.provider-item.active {
  background: var(--sider-item-active);
}

.provider-avatar {
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

.provider-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--sider-text);
}

.provider-delete {
  color: var(--sider-icon);
  font-size: 13px;
}

.provider-delete:hover {
  color: #ff4d4f;
}

.add-provider-btn {
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

.add-provider-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}
</style>
