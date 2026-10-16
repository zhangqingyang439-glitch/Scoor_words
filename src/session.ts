import { db } from './db'
import type { SessionItem, SessionPlan } from './study'

/**
 * 学习会话存档。
 *
 * StudyFlow 的进度（第几轮、队列、当前第几个、错词副本）原本只活在前端内存里，
 * 退出/切换页面就丢了，再进来是从头重新组会话 —— 背到一半退出就"白背"。
 * 这里把整个会话快照存进 IndexedDB（settings 表），StudyFlow 挂载时先查存档：
 * 有没背完的就原样接着（同一个词、同一个位置），**背完（四遍全过）才清档**，
 * 下次进来才从头开始。
 *
 * 按「哪本书/哪批勾选词」分别存档（key），互不打架；太久没动（7 天）的档在下次
 * 保存时顺手清掉，最多留 5 份。
 */

export interface SavedStudySession {
  spec: { kind: 'normal' | 'notebook'; extra?: boolean; wordBookId?: string; selectedIds?: string[] }
  plan: SessionPlan
  round: number
  queue: SessionItem[]
  idx: number
  intro: boolean
  savedAt: number
}

const KEY = 'study-sessions'
const KEEP_MS = 7 * 24 * 3600_000
const MAX_KEEP = 5

async function readMap(): Promise<Record<string, SavedStudySession>> {
  const row = await db.settings.get(KEY)
  return (row?.value as Record<string, SavedStudySession>) ?? {}
}

/** 常规学习会话：按书区分 */
export function normalSessionKey(bookId: string | null | undefined): string {
  return `normal:${bookId ?? 'none'}`
}

/** 记词本复习会话：同一本书 + 同一批勾选的词算同一个会话 */
export function notebookSessionKey(wordBookId?: string, selectedIds?: string[]): string {
  const ids = [...(selectedIds ?? [])].sort()
  let h = 5381
  for (const s of ids) for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return `nb:${wordBookId ?? 'all'}:${ids.length}:${h}`
}

export async function loadSession(key: string): Promise<SavedStudySession | null> {
  const map = await readMap()
  return map[key] ?? null
}

export async function saveSession(key: string, snap: SavedStudySession): Promise<void> {
  const map = await readMap()
  map[key] = snap
  const now = Date.now()
  const entries = Object.entries(map).filter(([, s]) => now - s.savedAt < KEEP_MS)
  entries.sort((a, b) => b[1].savedAt - a[1].savedAt)
  await db.settings.put({ key: KEY, value: Object.fromEntries(entries.slice(0, MAX_KEEP)) })
}

export async function clearSession(key: string): Promise<void> {
  const map = await readMap()
  if (!(key in map)) return
  delete map[key]
  await db.settings.put({ key: KEY, value: map })
}
