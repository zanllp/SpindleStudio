<template>
  <div class="conversation-sidebar">
    <button class="new-chat-btn" @click="handleCreate">
      <PlusOutlined />
      <span>{{ $t('common.newConversation') }}</span>
    </button>

    <div class="list-scroll">
      <a-spin :spinning="chatStore.isLoadingList" style="width: 100%;">
        <div v-if="chatStore.conversationList.length === 0" class="empty-tip">
          {{ $t('sidebar.empty') }}
        </div>
        <div
          v-for="conv in recentConversations"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: conv.id === chatStore.activeConversationId }"
          @click="chatStore.selectConversation(conv.id)"
        >
          <span class="conversation-title" :title="conv.title">{{ conv.title }}</span>
          <span class="conversation-actions" @click.stop>
            <a-tooltip :title="$t('sidebar.openInNewWindow')">
              <ExportOutlined class="action-icon" @click="openInNewWindow(conv.id)" />
            </a-tooltip>
            <a-tooltip :title="$t('sidebar.rename')">
              <EditOutlined class="action-icon" @click="openRename(conv)" />
            </a-tooltip>
            <a-popconfirm
              :title="$t('sidebar.deleteConfirm')"
              :ok-text="$t('common.delete')"
              :cancel-text="$t('common.cancel')"
              @confirm="chatStore.deleteConversation(conv.id)"
            >
              <a-tooltip :title="$t('common.delete')">
                <DeleteOutlined class="action-icon delete-icon" />
              </a-tooltip>
            </a-popconfirm>
          </span>
        </div>
        <!-- 超出 20 条截断时告知用户，避免旧会话"凭空消失" -->
        <div v-if="chatStore.conversationList.length > SIDEBAR_RECENT_LIMIT" class="recent-limit-hint">
          {{ $t('sidebar.recentLimitHint', { total: chatStore.conversationList.length }) }}
        </div>
      </a-spin>
    </div>

    <div class="sidebar-footer">
      <button class="settings-entry" @click="openNewWindow">
        <WindowsOutlined />
        <span>{{ $t('sidebar.newWindow') }}</span>
      </button>
      <button class="settings-entry" @click="settingsStore.settingsOpen = true">
        <SettingOutlined />
        <span>{{ $t('sidebar.settings') }}</span>
      </button>
    </div>

    <a-modal
      v-model:open="renameModalOpen"
      :title="$t('sidebar.renameTitle')"
      @ok="handleRenameOk"
    >
      <div class="rename-row">
        <a-input v-model:value="renameValue" :placeholder="$t('sidebar.renamePlaceholder')" @pressEnter="handleRenameOk" />
        <a-tooltip :title="$t('sidebar.aiSummarizeTooltip')">
          <AppButton :loading="aiTitleLoading" @click="handleAiSummarize">
            <RobotOutlined />
            {{ $t('sidebar.aiSummarize') }}
          </AppButton>
        </a-tooltip>
      </div>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { PlusOutlined, EditOutlined, DeleteOutlined, RobotOutlined, SettingOutlined, ExportOutlined, WindowsOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/chat'
import { useSettingsStore } from '@/stores/settings'
import AppButton from './AppButton.vue'
import type { ConversationSummary } from '@/types'

const chatStore = useChatStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()

const renameModalOpen = ref(false)
const renameValue = ref('')
const renamingId = ref<string | null>(null)
const aiTitleLoading = ref(false)

// 侧栏只维护最新 20 条会话：每个会话项带 3 个 a-tooltip + 1 个 a-popconfirm，
// 数量随会话数线性增长，限制渲染规模；更早的会话不在侧栏展示
const SIDEBAR_RECENT_LIMIT = 20
const recentConversations = computed(() => chatStore.conversationList.slice(0, SIDEBAR_RECENT_LIMIT))

async function handleCreate() {
  await chatStore.createNewConversation()
}

// 多窗口：新窗口直达指定会话（Electron 里开 BrowserWindow，浏览器里开新标签页）
function openInNewWindow(convId: string) {
  window.open(`${window.location.origin}/?conv=${convId}`, '_blank')
}

// 新建窗口：打开当前选中的会话（无选中时退回最近会话，与启动逻辑一致）
function openNewWindow() {
  const convId = chatStore.activeConversationId
  window.open(convId ? `${window.location.origin}/?conv=${convId}` : window.location.origin, '_blank')
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
    message.error(e.response?.data?.error || e.message || t('errors.aiSummarizeFailed'))
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
  /* 背景与模糊由外层 .chat-sider 统一绘制，内层保持透明 */
  background: transparent;
}

/* 仅会话列表滚动：头部「新对话」和底部「新建窗口/设置」固定不随列表滚动 */
.list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* 底部设置入口（Cherry Studio 风格左下角齿轮），固定在侧栏底部 */
.sidebar-footer {
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

/* 列表底部「仅展示最近 20 条」截断提示 */
.recent-limit-hint {
  color: var(--sider-faint);
  font-size: 12px;
  text-align: center;
  padding: 8px 0 12px;
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
