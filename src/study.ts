import {
  CUSTOM_BOOK,
  db,
  ensureProgress,
  getPlan,
  todayKey,
  bumpTodayStats,
  REVIEW_INTERVAL_MS,
  type BookPlan,
  type WordProgress,
} from './db'
import { getBook, loadBook, type BookMeta, type BookWord } from './books'
import type { Sense } from './books'

export const TOTAL_STAGES = 4

export interface StageNames {
  short: string
  title: string
  hint: string
}

/** 四遍的名字，界面到处用 */
export const STAGES: StageNames[] = [
  { short: '极速记忆', title: '第 1 遍 · 极速记忆', hint: '看单词和释义，混个眼熟' },
  { short: '看词填义', title: '第 2 遍 · 看词填义', hint: '按词性写出中文意思' },
  { short: '看义默写', title: '第 3 遍 · 看义默写', hint: '看着中文，写出英文' },
  { short: '例句翻译', title: '第 4 遍 · 例句翻译', hint: '翻译例句，学习用法' },
]

export function dailyQuota(book: BookMeta, plan: BookPlan): number {
  if (plan.mode === 'perDay') return Math.max(1, plan.perDay)
  return Math.max(1, Math.ceil(book.count / Math.max(1, plan.days)))
}

export function errorRate(rec: WordProgress): number {
  const total = rec.wrong + rec.right
  return total === 0 ? 0 : rec.wrong / total
}

export type ItemKind = 'new' | 'resume' | 'review'

export interface SessionItem {
  /** 词书 id（自定义词为 __custom__） */
  bookId: string
  /** 词在词书中的顺序 */
  order: number
  kind: ItemKind
  word: BookWord
  progress: WordProgress | null
  /** 已完成的遍数：轮次 r 只对 startStage < r 的词出现 */
  startStage: number
}

export interface SessionPlan {
  items: SessionItem[]
  quota: number
  todayNew: number
  newCount: number
  reviewCount: number
  resumeCount: number
}

/** 自定义词的进度行 -> 词形数据 */
export function customRowToWord(r: WordProgress): BookWord {
  return {
    name: r.word,
    trans: r.customData?.senses.map((s) => s.zh.join('；')) ?? [],
    usphone: r.customData?.usphone,
    ukphone: r.customData?.ukphone,
    senses: r.customData?.senses,
    forms: r.customData?.forms,
  }
}

async function getBookWords(book: BookMeta): Promise<{ words: BookWord[]; byName: Map<string, { w: BookWord; order: number }> }> {
  const words = await loadBook(book)
  const byName = new Map(words.map((w, i) => [w.name, { w, order: i }]))
  return { words, byName }
}

/**
 * 组一次学习会话（轮次制）：
 * - resume：之前学到一半的词（0 < stage < 4），从断点继续
 * - new：自定义词优先（不受额度限制），然后按词书顺序取新词（额度内）
 * - review：通关词里按错误率取前 50%，数量不超过额度，24h 内不重复
 */
export async function buildSession(book: BookMeta, extra = false): Promise<SessionPlan> {
  const plan = await getPlan(book.id)
  const quota = dailyQuota(book, plan)
  const { words, byName } = await getBookWords(book)

  const rows = await db.progress.where('bookId').equals(book.id).toArray()
  const byWord = new Map(rows.map((r) => [r.word, r]))

  const customRows = await db.progress.where('bookId').equals(CUSTOM_BOOK).toArray()
  const customByName = new Map(customRows.map((r) => [r.word, r]))

  const items: SessionItem[] = []
  let resumeCount = 0

  // 1) 断点续学：词书词
  for (const r of rows) {
    if (r.stage > 0 && r.stage < TOTAL_STAGES) {
      const found = byName.get(r.word)
      if (found) {
        items.push({ bookId: book.id, order: found.order, kind: 'resume', word: found.w, progress: r, startStage: r.stage })
        resumeCount += 1
      }
    }
  }
  // 1.5) 断点续学：自定义词
  for (const r of customRows) {
    if (r.stage > 0 && r.stage < TOTAL_STAGES) {
      items.push({ bookId: CUSTOM_BOOK, order: r.order, kind: 'resume', word: customRowToWord(r), progress: r, startStage: r.stage })
      resumeCount += 1
    }
  }

  // 2) 自定义新词：用户主动添加，不受额度限制
  let newCount = 0
  const customNewCount = customRows.filter((r) => r.stage === 0).length
  for (const r of customRows) {
    if (r.stage === 0) {
      items.push({ bookId: CUSTOM_BOOK, order: r.order, kind: 'new', word: customRowToWord(r), progress: r, startStage: 0 })
    }
  }
  newCount += customNewCount

  // 3) 词书新词（额度内；自定义词不占额度）
  const stat = await db.stats.get(todayKey())
  const todayNew = stat?.newLearned ?? 0
  const remaining = extra ? quota : Math.max(0, quota - todayNew)
  let bookNewCount = 0
  if (remaining > 0) {
    for (let order = 0; order < words.length && bookNewCount < remaining; order++) {
      const w = words[order]
      const r = byWord.get(w.name)
      if (r && r.stage > 0) continue
      items.push({ bookId: book.id, order, kind: 'new', word: w, progress: r ?? null, startStage: r?.stage ?? 0 })
      bookNewCount += 1
    }
  }
  newCount += bookNewCount

  // 4) 错误率前 50% 的通关词复习
  const now = Date.now()
  const passed = rows
    .filter((r) => r.stage >= TOTAL_STAGES && now - (r.lastReviewAt ?? 0) >= REVIEW_INTERVAL_MS)
    .sort((a, b) => errorRate(b) - errorRate(a) || a.order - b.order)
  const reviewPool = passed.slice(0, Math.ceil(passed.length / 2))
  const review = reviewPool.slice(0, extra ? 0 : quota)
  for (const r of review) {
    const found = byName.get(r.word)
    if (found) items.push({ bookId: book.id, order: found.order, kind: 'review', word: found.w, progress: r, startStage: 0 })
  }

  return { items, quota, todayNew, newCount, reviewCount: review.length, resumeCount }
}

/** 记录一次作答对错（第2/3遍判题时调用） */
export async function recordAnswer(item: SessionItem, ok: boolean): Promise<WordProgress> {
  const rec = await ensureProgress(item.bookId, item.word.name, item.order)
  if (ok) rec.right += 1
  else rec.wrong += 1
  await db.progress.put(rec)
  return rec
}

/** 完成某一遍：推进 stage；第4遍完成 = 通关 */
export async function completeStage(item: SessionItem, stage: number): Promise<WordProgress> {
  const rec = await ensureProgress(item.bookId, item.word.name, item.order)
  if (stage > rec.stage) rec.stage = stage
  if (stage >= TOTAL_STAGES) {
    if (!rec.passedAt) rec.passedAt = Date.now()
    rec.lastReviewAt = Date.now()
    await bumpTodayStats(item.kind !== 'review')
  }
  await db.progress.put(rec)
  return rec
}

/**
 * 词的释义列表：优先用 ECDICT 增强的 senses，
 * 没有就回退到 trans 行拆分（单组「释义」）。
 */
export function sensesOf(word: BookWord): Sense[] {
  if (word.senses && word.senses.length > 0) return word.senses
  const zh = word.trans.flatMap((t) => t.split(/[；;]/)).map((s) => s.trim()).filter(Boolean)
  return zh.length > 0 ? [{ pos: '释义', zh }] : [{ pos: '释义', zh: ['（无释义）'] }]
}

/** 记词本复习会话：某本单词书（或全部书）里收藏的词，完整四遍，不限量 */
export async function buildNotebookSession(wordBookId?: string, selectedIds?: string[]): Promise<SessionPlan> {
  const all = await db.progress.toArray()
  const sel = selectedIds && selectedIds.length > 0 ? new Set(selectedIds) : null
  const collectedRows = all.filter(
    (r) => r.collectedIn && (!wordBookId || r.collectedIn === wordBookId) && (!sel || sel.has(r.id)),
  )
  const bySource = new Map<string, WordProgress[]>()
  for (const r of collectedRows) {
    const list = bySource.get(r.bookId) ?? []
    list.push(r)
    bySource.set(r.bookId, list)
  }
  const items: SessionItem[] = []
  for (const [bookId, rows] of bySource) {
    if (bookId === CUSTOM_BOOK) {
      for (const r of rows) {
        items.push({ bookId: CUSTOM_BOOK, order: r.order, kind: r.stage >= TOTAL_STAGES ? 'review' : 'resume', word: customRowToWord(r), progress: r, startStage: 0 })
      }
      continue
    }
    const meta = getBook(bookId)
    if (!meta) continue
    const words = await loadBook(meta)
    const idxMap = new Map(words.map((w, i) => [w.name, i]))
    for (const r of rows) {
      const w = words.find((x) => x.name === r.word)
      if (!w) continue
      items.push({
        bookId,
        order: idxMap.get(r.word) ?? r.order,
        kind: r.stage >= TOTAL_STAGES ? 'review' : 'resume',
        word: w,
        progress: r,
        startStage: 0, // 记词本复习一律完整四遍
      })
    }
  }
  return { items, quota: 0, todayNew: 0, newCount: 0, reviewCount: items.length, resumeCount: 0 }
}

export interface TodayCounts {
  quota: number
  todayNew: number
  remainingNew: number
  resumeCount: number
  reviewAvailable: number
  passed: number
  learning: number
  total: number
}

/** 首页概览：今日额度/剩余/断点/可复习数/总进度 */
export async function todayCounts(bookId: string): Promise<TodayCounts> {
  const meta = getBook(bookId)
  if (!meta) throw new Error('词书不存在')
  const plan = await getPlan(bookId)
  const quota = dailyQuota(meta, plan)
  const stat = await db.stats.get(todayKey())
  const todayNew = stat?.newLearned ?? 0
  const rows = await db.progress.where('bookId').equals(bookId).toArray()
  const customRows = await db.progress.where('bookId').equals(CUSTOM_BOOK).toArray()
  const passedRows = rows.filter((r) => r.stage >= TOTAL_STAGES)
  const now = Date.now()
  const due = passedRows
    .filter((r) => now - (r.lastReviewAt ?? 0) >= REVIEW_INTERVAL_MS)
    .sort((a, b) => errorRate(b) - errorRate(a))
  const reviewPool = due.slice(0, Math.ceil(due.length / 2))
  return {
    quota,
    todayNew,
    remainingNew: Math.max(0, quota - todayNew),
    resumeCount: rows.filter((r) => r.stage > 0 && r.stage < TOTAL_STAGES).length + customRows.filter((r) => r.stage > 0 && r.stage < TOTAL_STAGES).length,
    reviewAvailable: Math.min(reviewPool.length, quota),
    passed: passedRows.length + customRows.filter((r) => r.stage >= TOTAL_STAGES).length,
    learning: rows.filter((r) => r.stage > 0 && r.stage < TOTAL_STAGES).length + customRows.filter((r) => r.stage > 0 && r.stage < TOTAL_STAGES).length,
    total: meta.count + customRows.length,
  }
}
