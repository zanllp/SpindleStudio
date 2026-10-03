<template>
  <a-layout class="chat-panel">
    <a-layout-sider width="260" class="chat-sider">
      <ConversationSidebar />
    </a-layout-sider>
    <a-layout-content class="chat-main">
      <div class="chat-center">
        <ChatMessageList ref="msgListRef" />
        <ChatInputBox />
      </div>
      <GenerationQueuePanel v-if="chatStore.queueOpen" @jump="jumpToMessage" />
      <FavoritesPanel
        v-if="chatStore.favoritesOpen"
        @jump="jumpToFavorite"
        @preview="previewImage"
      />
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat'
import ConversationSidebar from './ConversationSidebar.vue'
import ChatMessageList from './ChatMessageList.vue'
import ChatInputBox from './ChatInputBox.vue'
import GenerationQueuePanel from './GenerationQueuePanel.vue'
import FavoritesPanel from './FavoritesPanel.vue'

const chatStore = useChatStore()
const msgListRef = ref<InstanceType<typeof ChatMessageList>>()

// 队列卡片跳转：先切到目标会话，再滚动定位到对应消息
async function jumpToMessage(convId: string, messageId: string) {
  if (chatStore.activeConversationId !== convId) {
    await chatStore.selectConversation(convId)
  }
  await nextTick()
  msgListRef.value?.scrollToMessage(messageId)
}

// 会话内收藏只属于当前会话，直接滚动定位
function jumpToFavorite(messageId: string) {
  msgListRef.value?.scrollToMessage(messageId)
}

function previewImage(url: string) {
  msgListRef.value?.openPreview(url)
}
</script>

<style scoped>
.chat-panel {
  height: 100%;
}

.chat-sider {
  background: var(--sider-bg);
  border-right: 1px solid var(--sider-border);
  backdrop-filter: var(--sider-blur);
}

.chat-main {
  display: flex;
  flex-direction: row;
  background: var(--main-bg);
  backdrop-filter: var(--main-blur);
  min-width: 0;
}

.chat-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
</style>
