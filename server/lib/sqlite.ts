/**
 * Thin SQLite adapter over Node's built-in `node:sqlite`.
 *
 * Requires Node >= 22.5 — the packaged app runs it inside Electron (>= 35),
 * which ships the same Node core module, so there is no native addon to
 * install or rebuild for any platform.
 */

export interface SqlRunResult {
  changes: number
  lastInsertRowid: number
}

export interface SqlStatement {
  run(...params: unknown[]): SqlRunResult
  get(...params: unknown[]): any
  all(...params: unknown[]): any[]
}

export interface SqlDatabase {
  exec(sql: string): void
  prepare(sql: string): SqlStatement
  close(): void
}

function wrap(db: any): SqlDatabase {
  return {
    exec: (sql: string) => db.exec(sql),
    prepare: (sql: string) => {
      const stmt = db.prepare(sql)
      return {
        run: (...params: unknown[]) => {
          const result = stmt.run(...params)
          return {
            changes: Number(result?.changes ?? 0),
            lastInsertRowid: Number(result?.lastInsertRowid ?? 0),
          }
        },
        get: (...params: unknown[]) => stmt.get(...params),
        all: (...params: unknown[]) => stmt.all(...params),
      }
    },
    close: () => db.close(),
  }
}

export function openDatabase(file: string): SqlDatabase {
  let nodeSqlite: any = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    nodeSqlite = require('node:sqlite')
  } catch {
    nodeSqlite = null
  }
  if (!nodeSqlite?.DatabaseSync) {
    throw new Error('node:sqlite is missing — this build needs Node >= 22.5 / Electron >= 35')
  }

  const db = new nodeSqlite.DatabaseSync(file)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA synchronous = NORMAL')
  return wrap(db)
}
