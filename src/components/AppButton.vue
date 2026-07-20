<template>
  <button
    class="app-btn"
    :class="[`app-btn--${type}`, `app-btn--${size}`]"
    :disabled="disabled || loading"
  >
    <LoadingOutlined v-if="loading" class="app-btn-loading" />
    <slot />
  </button>
</template>

<script setup lang="ts">
import { LoadingOutlined } from '@ant-design/icons-vue'

// 全主题变量驱动的轻量按钮：替代 antd Button（其 cssinjs 样式层级复杂，玻璃主题下难适配）。
// scoped 里是几何结构 + ChatGPT 默认皮肤；玻璃主题皮肤在 themes.css 用
// html[data-theme='x'] 前缀覆盖（特异性高于 scoped，且与组件解耦）
withDefaults(defineProps<{
  type?: 'default' | 'primary' | 'danger'
  size?: 'middle' | 'small'
  disabled?: boolean
  loading?: boolean
}>(), {
  type: 'default',
  size: 'middle',
  disabled: false,
  loading: false,
})
</script>

<style scoped>
.app-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px 14px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  background: #fff;
  color: #1f1f1f;
  font-size: 14px;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s;
}

.app-btn--small {
  padding: 2px 10px;
  font-size: 13px;
  border-radius: 7px;
}

.app-btn:not(:disabled):hover {
  border-color: #0d0d0d;
}

.app-btn--primary {
  background: #0d0d0d;
  border-color: #0d0d0d;
  color: #fff;
}

.app-btn--primary:not(:disabled):hover {
  background: #000;
  border-color: #000;
}

.app-btn--danger {
  border-color: #ff7875;
  color: #ff4d4f;
}

.app-btn--danger:not(:disabled):hover {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: #fff;
}

.app-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.app-btn-loading {
  font-size: 12px;
}
</style>
