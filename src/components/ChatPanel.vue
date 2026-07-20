<template>
  <a-layout class="chat-panel">
    <a-layout-sider width="260" class="chat-sider">
      <ConversationSidebar />
    </a-layout-sider>
    <a-layout-content class="chat-main">
      <ChatMessageList />
      <ChatInputBox />
    </a-layout-content>
  </a-layout>
</template>

<script setup lang="ts">
import ConversationSidebar from './ConversationSidebar.vue'
import ChatMessageList from './ChatMessageList.vue'
import ChatInputBox from './ChatInputBox.vue'
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
  flex-direction: column;
  background: var(--main-bg);
  backdrop-filter: var(--main-blur);
  min-width: 0;
}
</style>
