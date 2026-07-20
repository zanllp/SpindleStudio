import { promises as fs } from 'fs'
import path from 'path'
import type { GenerationTask } from '../providers/types'

// Persistent task registry (tasks.json). Survives server restarts so polling can
// resume with full metadata — previously task metadata lived only in memory and
// was lost on restart (EXIF/落盘退化为默认值).
let tasksFile = ''
const tasks = new Map<string, GenerationTask>()
let writeQueue: Promise<void> = Promise.resolve()

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
  tasks.set(taskId, { ...existing, ...patch, updatedAt: Date.now() })
  return scheduleWrite()
}
