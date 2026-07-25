<template>
  <div class="model-list">
    <div v-for="(row, i) in rows" :key="i" class="model-row" :class="{ disabled: !row.enabled }">
      <a-switch
        :checked="row.enabled"
        size="small"
        class="model-switch"
        :title="$t('settings.providers.model.enabled')"
        @change="toggle(i, $event as boolean)"
      />
      <a-input v-model:value="row.id" class="model-id" :placeholder="$t('settings.providers.model.idPlaceholder')" @blur="emitUpdate" />
      <a-input v-model:value="row.label" class="model-label" :placeholder="$t('settings.providers.model.labelPlaceholder')" @blur="emitUpdate" />
      <DeleteOutlined class="model-delete" :title="$t('common.delete')" @click="remove(i)" />
    </div>
    <button class="add-model-btn" @click="add">
      <PlusOutlined />
      <span>{{ $t('settings.providers.model.add') }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import type { ProviderModel } from '@/types'

const props = defineProps<{ models: ProviderModel[] }>()
const emit = defineEmits<{ 'update:models': [models: ProviderModel[]] }>()

interface Row {
  id: string
  label: string
  enabled: boolean
  extra?: Record<string, any>
}

const rows = ref<Row[]>([])

// 外部模型列表变化（切换供应商/远程更新）时刷新本地行
watch(
  () => props.models,
  models => {
    rows.value = models.map(m => ({
      id: m.id,
      label: m.label === m.id ? '' : m.label,
      enabled: m.enabled !== false,
      extra: m.extra,
    }))
  },
  { immediate: true, deep: true },
)

function emitUpdate() {
  const models: ProviderModel[] = rows.value
    .filter(r => r.id.trim())
    .map(r => ({
      id: r.id.trim(),
      label: r.label.trim() || r.id.trim(),
      // 缺省即启用，仅显式停用时落盘
      ...(r.enabled ? {} : { enabled: false }),
      ...(r.extra ? { extra: r.extra } : {}),
    }))
  emit('update:models', models)
}

// 开关立即生效（输入框则 blur 才保存）
function toggle(i: number, checked: boolean) {
  rows.value[i].enabled = checked
  emitUpdate()
}

function add() {
  rows.value.push({ id: '', label: '', enabled: true })
}

function remove(i: number) {
  rows.value.splice(i, 1)
  emitUpdate()
}
</script>

<style scoped>
.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 停用的行整体降透明度，开关本身保持不透明以便辨认 */
.model-row.disabled :deep(.ant-input) {
  opacity: 0.45;
}

.model-switch {
  flex-shrink: 0;
}

.model-id {
  flex: 3;
}

.model-label {
  flex: 2;
}

.model-delete {
  color: var(--sider-icon);
  font-size: 13px;
  cursor: pointer;
}

.model-delete:hover {
  color: #ff4d4f;
}

.add-model-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.add-model-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}
</style>
