import { promises as fs } from 'fs'
import path from 'path'
import type { GenerationTask } from '../providers/types'

// Persistent task registry (tasks.json). Survives server restarts so polling can
// resume with full metadata — previously task metadata lived only in memory and
// was lost on restart (EXIF/落盘退化为默认值).
let tasksFile = ''
const tasks = new Map<string, GenerationTask>()
let writeQueue: Promise<void> = Promise.resolve()

// Settled tasks are kept for 7 days (error replay / multi-window resume), then
// pruned.
const SETTLED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
// Pending tasks get 1 day: upstream providers give up within about a day
// anyway, so an older pending task is dead — pruning it lets a late poll fail
// cleanly instead of hanging forever.
const PENDING_RETENTION_MS = 24 * 60 * 60 * 1000
// Hard cap on settled tasks — the registry is rewritten wholesale on every
// change, so unbounded growth (heavy usage within the retention window) would
// make every write slower. Pending tasks never count against the cap.
const MAX_SETTLED_TASKS = 500
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000

// Heavy fields a failed task no longer needs — poll replay only returns
// { task_id, status, error }; the conversation message carries the prompt.
function slimFailedTask(t: GenerationTask): boolean {
  let changed = false
  for (const key of ['prompt', 'payload', 'referenceImagePaths', 'extra'] as const) {
    if (t[key] !== undefined && t[key] !== '') {
      delete (t as any)[key]
      changed = true
    }
  }
  return changed
}

// Slim + age-out + cap. Returns what changed so the caller can log/persist.
function maintainRegistry(): { pruned: number; slimmed: number } {
  let pruned = 0
  let slimmed = 0
  // Failed tasks keep only the error (also retroactive — older records still
  // carry prompts from before slimming was introduced)
  for (const t of tasks.values()) {
    if (t.status === 'failed' && slimFailedTask(t)) slimmed++
  }
  for (const [id, t] of tasks) {
    const retention = t.status === 'pending' ? PENDING_RETENTION_MS : SETTLED_RETENTION_MS
    const at = t.updatedAt || t.createdAt || 0
    if (at && at < Date.now() - retention) {
      tasks.delete(id)
      pruned++
    }
  }
  const settled = [...tasks.values()].filter(t => t.status !== 'pending')
  if (settled.length > MAX_SETTLED_TASKS) {
    settled.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    for (const t of settled.slice(MAX_SETTLED_TASKS)) {
      tasks.delete(t.taskId)
      pruned++
    }
  }
  return { pruned, slimmed }
}

function maintainAndPersist(context: string): void {
  const { pruned, slimmed } = maintainRegistry()
  if (pruned || slimmed) {
    console.log(`tasks.json maintained (${context}): ${pruned} pruned, ${slimmed} failed-task record(s) slimmed`)
    void scheduleWrite()
  }
}

export async function initTasks(dataDir: string): Promise<void> {
  tasksFile = path.join(dataDir, 'tasks.json')
  try {
    const raw = await fs.readFile(tasksFile, 'utf-8')
    // Strip a possible BOM — JSON.parse rejects it
    const data = JSON.parse(raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw)
    for (const t of Array.isArray(data?.tasks) ? data.tasks : []) {
      if (t?.taskId) tasks.set(t.taskId, t)
    }
  } catch {
    // No tasks file yet or corrupted — start empty
  }
  maintainAndPersist('startup')
  // Long-running servers (packaged app can stay open for days) re-prune daily;
  // unref so the timer never keeps the process alive on its own
  setInterval(() => maintainAndPersist('daily'), PRUNE_INTERVAL_MS).unref()
}

// Serialize writes to avoid concurrent-write corruption
function scheduleWrite(): Promise<void> {
  writeQueue = writeQueue
    .then(async () => {
      await fs.mkdir(path.dirname(tasksFile), { recursive: true })
      await fs.writeFile(tasksFile, JSON.stringify({ tasks: [...tasks.values()] }, null, 2))
    })
    .catch(() => {
      // Persistence failure is non-fatal — task state still lives in memory
    })
  return writeQueue
}

export function createTask(task: GenerationTask): Promise<void> {
  tasks.set(task.taskId, task)
  return scheduleWrite()
}

export function getTask(taskId: string): GenerationTask | undefined {
  return tasks.get(taskId)
}

export function updateTask(taskId: string, patch: Partial<GenerationTask>): Promise<void> {
  const existing = tasks.get(taskId)
  if (!existing) return Promise.resolve()
  const next = { ...existing, ...patch, updatedAt: Date.now() }
  if (next.status === 'failed') slimFailedTask(next)
  tasks.set(taskId, next)
  return scheduleWrite()
}
