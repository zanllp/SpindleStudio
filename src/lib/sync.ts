// Real-time sync across browser tabs and Electron windows via socket.io.
// The server emits events after each conversation CRUD operation — the client
// only listens and refreshes via the existing REST API. Works across different
// localhost ports (dev 5173 / prod 3210 / Electron) with no origin restrictions.

import { io, Socket } from 'socket.io-client'

const SOCKET_URL = window.location.origin

function log(msg: string, ...args: unknown[]) {
  console.log(`[sync] ${msg}`, ...args)
}

let socket: Socket | null = null

function ensureConnected() {
  if (socket?.connected) return

  if (!socket) {
    log(`connecting to ${SOCKET_URL}`)
    socket = io(SOCKET_URL, {
      transports: ['websocket'], // local — skip polling upgrade
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    socket.on('connect', () => log('connected', socket!.id))
    socket.on('disconnect', (reason) => log('disconnected:', reason))
    socket.on('connect_error', (err) => log('connect error:', err.message))

    let attempts = 0
    socket.io.on('reconnect_attempt', () => {
      attempts++
      log(`reconnect attempt ${attempts} …`)
    })
    socket.io.on('reconnect', () => {
      log(`reconnected after ${attempts} attempt(s)`)
      attempts = 0
    })
    socket.io.on('reconnect_failed', () => {
      log('reconnect failed after max attempts')
    })
  } else {
    log('reconnecting …')
    socket.connect()
  }
}

export function onSync(handlers: {
  onConversationsChanged: () => void
  onConversationUpdated: (convId: string) => void
  onConfigChanged: () => void
}) {
  ensureConnected()
  socket!.off('conversations-changed')
  socket!.off('conversation-updated')
  socket!.off('config-changed')
  socket!.on('conversations-changed', () => {
    log('← conversations-changed')
    handlers.onConversationsChanged()
  })
  socket!.on('conversation-updated', ({ convId }: { convId: string }) => {
    log('← conversation-updated', convId)
    handlers.onConversationUpdated(convId)
  })
  socket!.on('config-changed', () => {
    log('← config-changed')
    handlers.onConfigChanged()
  })
  log('listening')
}
