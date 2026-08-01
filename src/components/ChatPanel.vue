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
