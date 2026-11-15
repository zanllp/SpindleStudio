/**
 * Conversation storage — SQLite is the single source of truth.
 *
 * Layout:
 *   conversations(id, title, created_at, updated_at, favorites)
 *   messages(id, conv_id, position, payload, hash)
 *
 * Every message is stored as its own row (payload = the message JSON exactly as
 * the client sends it) plus an md5 hash. Saving a conversation therefore only
 * writes the messages that actually changed instead of rewriting a multi-MB
 * document, and the sidebar list no longer has to parse every conversation.
 *
 * Legacy data: on first start, if the conversations table is empty and
 * <data>/conversations/*.json exists, those files are imported once. The JSON
 * files are left untouched as a read-only archive — they are never written
 * again, and an import never runs once the table has rows, so deleting a
 * conversation can't be undone by a stale file.
 */

import crypto from 'crypto'
import path from 'path'
import { promises as fs } from 'fs'
import { openDatabase, type SqlDatabase } from './sqlite'

export interface ConversationSummary {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  pinned: boolean
  archived: boolean
  turnCount: number
  lastGeneratedAt: number
}

export interface ConversationDoc extends ConversationSummary {
  messages: any[]
  favorites?: any[]
}

export interface FavoriteEntry {
  conversationId: string
  conversationTitle: string
  conversationUpdatedAt: number
  [key: string]: any
}

export interface SaveStats {
  messagesWritten: number
  messagesReordered: number
  messagesDeleted: number
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  turn_count INTEGER NOT NULL DEFAULT 0,
  last_generated_at INTEGER NOT NULL DEFAULT 0,
  favorites TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conv_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  payload TEXT NOT NULL,
  hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conv_id, position);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

let db: SqlDatabase | null = null

function getDb(): SqlDatabase {
  if (!db) throw new Error('[db] conversation store is not initialised')
  return db
}

function md5(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex')
}

function transaction<T>(work: () => T): T {
  const database = getDb()
  database.exec('BEGIN')
  try {
    const result = work()
    database.exec('COMMIT')
    return result
  } catch (error) {
    try { database.exec('ROLLBACK') } catch { /* already rolled back */ }
    throw error
  }
}

/** Opens the database and, on a fresh install, imports legacy conversation JSON. */
export async function initConversationStore(dataDir: string): Promise<void> {
  db = openDatabase(path.join(dataDir, 'app.db'))
  db.exec(SCHEMA)
  const columns = db.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>
  if (!columns.some(column => column.name === 'pinned')) {
    db.exec('ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
  }
  if (!columns.some(column => column.name === 'archived')) {
    db.exec('ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
  }
  if (!columns.some(column => column.name === 'turn_count')) {
    db.exec('ALTER TABLE conversations ADD COLUMN turn_count INTEGER NOT NULL DEFAULT 0')
    db.exec(`
      UPDATE conversations
         SET turn_count = COALESCE((
           SELECT COUNT(*)
             FROM messages u
             JOIN messages a ON a.conv_id = u.conv_id AND a.position = u.position + 1
            WHERE u.conv_id = conversations.id
              AND json_extract(u.payload, '$.role') = 'user'
              AND json_extract(a.payload, '$.role') = 'assistant'
         ), 0)
    `)
  }
  if (!columns.some(column => column.name === 'last_generated_at')) {
    db.exec('ALTER TABLE conversations ADD COLUMN last_generated_at INTEGER NOT NULL DEFAULT 0')
    db.exec(`
      UPDATE conversations
         SET last_generated_at = COALESCE((
           SELECT MAX(COALESCE(json_extract(payload, '$.createdAt'), 0))
             FROM messages
            WHERE conv_id = conversations.id
              AND json_extract(payload, '$.role') = 'assistant'
         ), 0)
    `)
  }
  const imported = await importLegacyConversationJson(path.join(dataDir, 'conversations'))
  console.log(
    `[db] conversations ready — ${countConversations()} conversation(s)` +
    (imported ? `, imported ${imported} from legacy JSON` : ''),
  )
}

export function countConversations(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS count FROM conversations').get()
  return Number(row?.count ?? 0)
}

export function listConversations(): ConversationSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT id, title, created_at AS createdAt, updated_at AS updatedAt, pinned, archived,
              turn_count AS turnCount, last_generated_at AS lastGeneratedAt
         FROM conversations
        ORDER BY archived ASC, pinned DESC, updated_at DESC`,
    )
    .all() as Array<Omit<ConversationSummary, 'pinned' | 'archived'> & { pinned: number; archived: number }>
  return rows.map(row => ({ ...row, pinned: Boolean(row.pinned), archived: Boolean(row.archived) }))
}

export function getConversation(id: string): ConversationDoc | null {
  const database = getDb()
  const row = database
    .prepare(
      `SELECT id, title, created_at AS createdAt, updated_at AS updatedAt, pinned, archived,
              turn_count AS turnCount, last_generated_at AS lastGeneratedAt, favorites
         FROM conversations
        WHERE id = ?`,
    )
    .get(id)
  if (!row) return null

  const messageRows = database
    .prepare('SELECT payload FROM messages WHERE conv_id = ? ORDER BY position ASC')
    .all(id) as Array<{ payload: string }>

  const doc: ConversationDoc = {
    id: row.id,
    title: row.title ?? '',
    createdAt: Number(row.createdAt) || 0,
    updatedAt: Number(row.updatedAt) || 0,
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    turnCount: Number(row.turnCount) || 0,
    lastGeneratedAt: Number(row.lastGeneratedAt) || 0,
    messages: messageRows.map(row => JSON.parse(row.payload)),
  }
  if (typeof row.favorites === 'string') {
    try {
      doc.favorites = JSON.parse(row.favorites)
    } catch {
      // Favourites are advisory — a corrupt blob must not hide the conversation
    }
  }
  return doc
}

/**
 * Upserts a conversation document. Message rows are diffed by hash+position, so
 * a save that only appends one message writes exactly one row.
 */
export function saveConversation(doc: ConversationDoc): SaveStats {
  const database = getDb()
  const id = String(doc.id || '')
  if (!id) throw new Error('conversation id is required')

  const now = Date.now()
  const title = String(doc.title ?? '')
  const createdAt = Number(doc.createdAt) || now
  const updatedAt = Number(doc.updatedAt) || now
  const pinned = doc.pinned ? 1 : 0
  const archived = doc.archived ? 1 : 0
  const favorites = Array.isArray(doc.favorites) ? JSON.stringify(doc.favorites) : null
  const messages = Array.isArray(doc.messages) ? doc.messages : []
  let turnCount = 0
  let lastGeneratedAt = 0
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    if (message?.role === 'user' && messages[index + 1]?.role === 'assistant') turnCount++
    if (message?.role === 'assistant') {
      lastGeneratedAt = Math.max(lastGeneratedAt, Number(message.createdAt) || 0)
    }
  }

  let messagesWritten = 0
  let messagesReordered = 0
  let messagesDeleted = 0

  transaction(() => {
    database
      .prepare(
        `INSERT INTO conversations (id, title, created_at, updated_at, pinned, archived, turn_count, last_generated_at, favorites)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           updated_at = excluded.updated_at,
           turn_count = excluded.turn_count,
           last_generated_at = excluded.last_generated_at,
           favorites = excluded.favorites`,
      )
      .run(id, title, createdAt, updatedAt, pinned, archived, turnCount, lastGeneratedAt, favorites)

    const existing = new Map<string, { hash: string; position: number }>()
    for (const row of database.prepare('SELECT id, hash, position FROM messages WHERE conv_id = ?').all(id)) {
      existing.set(String(row.id), { hash: String(row.hash), position: Number(row.position) })
    }

    const upsert = database.prepare(
      `INSERT INTO messages (id, conv_id, position, payload, hash)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         conv_id = excluded.conv_id,
         position = excluded.position,
         payload = excluded.payload,
         hash = excluded.hash`,
    )
    // Deleting a message in the middle shifts every later position. Those rows
    // keep their payload — only the integer column is touched, so a mid-list
    // delete doesn't rewrite megabytes of message text.
    const setPosition = database.prepare('UPDATE messages SET position = ? WHERE id = ?')

    const keep = new Set<string>()
    const reorder: Array<[string, number]> = []
    messages.forEach((message, position) => {
      const messageId = String(message?.id || '')
      if (!messageId) return
      keep.add(messageId)
      const payload = JSON.stringify(message)
      const hash = md5(payload)
      const previous = existing.get(messageId)
      if (previous && previous.hash === hash) {
        if (previous.position !== position) reorder.push([messageId, position])
        return
      }
      upsert.run(messageId, id, position, payload, hash)
      messagesWritten++
    })

    for (const [messageId, position] of reorder) {
      setPosition.run(position, messageId)
      messagesReordered++
    }

    if (existing.size > keep.size) {
      const remove = database.prepare('DELETE FROM messages WHERE id = ?')
      for (const messageId of existing.keys()) {
        if (keep.has(messageId)) continue
        remove.run(messageId)
        messagesDeleted++
      }
    }
  })

  return { messagesWritten, messagesReordered, messagesDeleted }
}

export function deleteConversation(id: string): boolean {
  const database = getDb()
  const existed = database.prepare('SELECT 1 AS one FROM conversations WHERE id = ?').get(id) !== undefined
  transaction(() => {
    // Explicit message delete as well — foreign keys may be disabled by an
    // older driver, and orphan rows are useless either way.
    database.prepare('DELETE FROM messages WHERE conv_id = ?').run(id)
    database.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  })
  return existed
}

export function listFavorites(): FavoriteEntry[] {
  const rows = getDb()
    .prepare(
      `SELECT id AS conversationId, title AS conversationTitle,
              updated_at AS conversationUpdatedAt, favorites
         FROM conversations
        WHERE favorites IS NOT NULL
        ORDER BY updated_at DESC`,
    )
    .all() as Array<{
      conversationId: string
      conversationTitle: string
      conversationUpdatedAt: number
      favorites: string
    }>

  const entries: FavoriteEntry[] = []
  for (const row of rows) {
    try {
      const favorites = JSON.parse(row.favorites)
      if (!Array.isArray(favorites)) continue
      for (const favorite of favorites) {
        if (!favorite || typeof favorite !== 'object') continue
        entries.push({
          ...favorite,
          conversationId: row.conversationId,
          conversationTitle: row.conversationTitle,
          conversationUpdatedAt: Number(row.conversationUpdatedAt) || 0,
        })
      }
    } catch {
      // Ignore a corrupt favorites blob; the conversation itself is still readable.
    }
  }
  return entries.sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
}

export function setConversationPinned(id: string, pinned: boolean): boolean {
  const result = getDb()
    .prepare('UPDATE conversations SET pinned = ? WHERE id = ?')
    .run(pinned ? 1 : 0, id)
  return result.changes > 0
}

export function setConversationArchived(id: string, archived: boolean): boolean {
  const result = getDb()
    .prepare('UPDATE conversations SET archived = ? WHERE id = ?')
    .run(archived ? 1 : 0, id)
  return result.changes > 0
}

export function deleteConversationFavorite(conversationId: string, favoriteId: string): boolean {
  const database = getDb()
  const row = database
    .prepare('SELECT favorites FROM conversations WHERE id = ?')
    .get(conversationId) as { favorites?: string | null } | undefined
  if (!row || typeof row.favorites !== 'string') return false

  let favorites: any[]
  try {
    const parsed = JSON.parse(row.favorites)
    if (!Array.isArray(parsed)) return false
    favorites = parsed
  } catch {
    return false
  }

  const next = favorites.filter(favorite => favorite?.id !== favoriteId)
  if (next.length === favorites.length) return false
  database
    .prepare('UPDATE conversations SET favorites = ? WHERE id = ?')
    .run(JSON.stringify(next), conversationId)
  return true
}

/** One-shot import of <data>/conversations/*.json into an empty table. */
async function importLegacyConversationJson(dir: string): Promise<number> {
  if (countConversations() > 0) return 0

  let files: string[] = []
  try {
    files = await fs.readdir(dir)
  } catch {
    return 0
  }
  const jsonFiles = files.filter(file => file.endsWith('.json'))
  if (jsonFiles.length === 0) return 0

  let imported = 0
  for (const file of jsonFiles) {
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf-8')
      const doc = JSON.parse(raw) as ConversationDoc
      if (!doc?.id) continue
      saveConversation(doc)
      imported++
    } catch (error: any) {
      console.warn(`[db] skipped unreadable conversation ${file}: ${error.message}`)
    }
  }
  return imported
}
