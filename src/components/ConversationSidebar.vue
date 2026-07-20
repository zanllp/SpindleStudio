<template>
  <div class="conversation-sidebar">
    <button class="new-chat-btn" @click="handleCreate">
      <PlusOutlined />
      <span>新对话</span>
    </button>

    <a-spin :spinning="chatStore.isLoadingList" style="width: 100%;">
      <div v-if="chatStore.conversationList.length === 0" class="empty-tip">
        暂无对话
      </div>
      <div
        v-for="conv in chatStore.conversationList"
        :key="conv.id"
        class="conversation-item"
        :class="{ active: conv.id === chatStore.activeConversationId }"
        @click="chatStore.selectConversation(conv.id)"
      >
        <span class="conversation-title" :title="conv.title">{{ conv.title }}</span>
        <span class="conversation-actions" @click.stop>
          <a-tooltip title="重命名">
            <EditOutlined class="action-icon" @click="openRename(conv)" />
          </a-tooltip>
          <a-popconfirm
            title="确定删除该对话？"
            ok-text="删除"
            cancel-text="取消"
            @confirm="chatStore.deleteConversation(conv.id)"
          >
            <a-tooltip title="删除">
              <DeleteOutlined class="action-icon delete-icon" />
            </a-tooltip>
          </a-popconfirm>
        </span>
      </div>
    </a-spin>

    <div class="sidebar-footer">
      <button class="settings-entry" @click="settingsStore.settingsOpen = true">
        <SettingOutlined />
        <span>设置</span>
      </button>
    </div>

    <a-modal
      v-model:open="renameModalOpen"
      title="重命名对话"
      ok-text="确定"
      cancel-text="取消"
      @ok="handleRenameOk"
    >
      <div class="rename-row">
        <a-input v-model:value="renameValue" placeholder="对话标题" @pressEnter="handleRenameOk" />
        <a-tooltip title="根据对话中的用户消息，让 AI 概括一个标题">
          <AppButton :loading="aiTitleLoading" @click="handleAiSummarize">
            <RobotOutlined />
            AI 总结
          </AppButton>
        </a-tooltip>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PlusOutlined, EditOutlined, DeleteOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import AppButton from './AppButton.vue'
import type { ConversationSummary } from '@/types'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()

const renameModalOpen = ref(false)
const renameValue = ref('')
const renamingId = ref<string | null>(null)
const aiTitleLoading = ref(false)

async function handleCreate() {
  await chatStore.createNewConversation()
}

function openRename(conv: ConversationSummary) {
  renamingId.value = conv.id
  renameValue.value = conv.title
  renameModalOpen.value = true
}

async function handleRenameOk() {
  if (renamingId.value && renameValue.value.trim()) {
    await chatStore.renameConversation(renamingId.value, renameValue.value)
  }
  renameModalOpen.value = false
}

// AI 总结标题：只提交用户消息，生成后填入输入框，可再编辑后确定
async function handleAiSummarize() {
  if (!renamingId.value) return
  aiTitleLoading.value = true
  try {
    renameValue.value = await chatStore.summarizeTitle(renamingId.value)
  } catch (e: any) {
    message.error(e.response?.data?.error || e.message || 'AI 总结失败')
  } finally {
    aiTitleLoading.value = false
  }
}
</script>

<style scoped>
.conversation-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px;
  overflow-y: auto;
  /* 背景与模糊由外层 .chat-sider 统一绘制，内层保持透明 */
  background: transparent;
}

/* 底部设置入口（Cherry Studio 风格左下角齿轮） */
.sidebar-footer {
  margin-top: auto;
  flex-shrink: 0;
  padding-top: 8px;
  border-top: 1px solid var(--sider-border);
}

.settings-entry {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--sider-text);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.settings-entry:hover {
  background: var(--sider-item-hover);
}

/* 新对话：白底描边卡片按钮，比实心主按钮更轻 */
.new-chat-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  margin-bottom: 10px;
  border: 1px solid var(--newbtn-border);
  border-radius: var(--newbtn-radius);
  background: var(--newbtn-bg);
  color: var(--newbtn-text);
  text-shadow: var(--newbtn-text-shadow);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.new-chat-btn:hover {
  border-color: var(--newbtn-hover-border);
  box-shadow: var(--newbtn-hover-shadow);
}

.empty-tip {
  color: var(--sider-faint);
  font-size: 13px;
  text-align: center;
  padding: 24px 0;
}

.conversation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  /* 透明边框占位：玻璃主题选中态要显示描边，避免 1px 位移 */
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.conversation-item:hover {
  background: var(--sider-item-hover);
}

.conversation-item.active {
  background: var(--sider-item-active);
}

.conversation-item.active .conversation-title {
  font-weight: var(--sider-active-weight);
  color: var(--sider-item-active-text);
}

.conversation-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  color: var(--sider-text);
}

.conversation-actions {
  display: none;
  align-items: center;
  gap: 10px;
  margin-left: 8px;
}

.conversation-item:hover .conversation-actions {
  display: inline-flex;
}

.action-icon {
  color: var(--sider-icon);
  font-size: 13px;
  transition: color 0.15s;
}

.action-icon:hover {
  color: var(--sider-icon-hover);
}

.delete-icon:hover {
  color: #ff4d4f;
}

/* 重命名弹窗：输入框 + AI 总结按钮同行 */
.rename-row {
  display: flex;
  gap: 8px;
}

.rename-row .ant-input {
  flex: 1;
}
</style>
