import Dexie, { type Table } from 'dexie'
import type { BookWord, Sense } from './books'

/** 词性用英文缩写标签（adj. / n. / v.），来源 ECDICT */
export type { Sense }

/**
 * 从在线词库下载到本机的词书。
 * 词条整本存在 IndexedDB 里 —— 下载一次之后完全离线可用，
 * 断网、没梯子、源站挂了都不影响。
 */
export interface MyBookRow {
  /** 就是在线词库的 id */
  id: string
  name: string
  description: string
  category: string
  count: number
  words: BookWord[]
  addedAt: number
}

/** 记词本里的“单词书” */
export interface WordBookRow {
  id: string
  name: string
  createdAt: number
  order: number
}

/** 在线翻译结果缓存（离线复用） */
export interface CnCacheRow {
  q: string
  result: string
  at: number
}

export const DEFAULT_WORD_BOOK = 'wb_default'
/** 自定义添加的词，学习记录挂在虚拟书下 */
export const CUSTOM_BOOK = '__custom__'

/** 首页手动添加的词携带的释义数据 */
export interface CustomWordData {
  senses: Sense[]
  usphone?: string
  ukphone?: string
  forms?: string[]
}

/**
 * 学习进度模型（v3，四遍通关制）：
 * stage 0=未开始 1=极速记忆完成 2=填义完成 3=默写完成 4=通关
 * collectedIn：收藏进哪本单词书（null=未收藏）
 */
export interface WordProgress {
  /** `${bookId}:${word}`；自定义词为 `__custom__:${word}` */
  id: string
  bookId: string
  word: string
  /** 在词书中的顺序，决定新词出现顺序；自定义词用添加时间戳 */
  order: number
  stage: number
  wrong: number
  right: number
  collectedIn: string | null
  passedAt?: number
  lastReviewAt?: number
  /** 自定义词的释义数据（词书里没有的词） */
  customData?: CustomWordData
}

/** 单本词书的学习计划 */
export interface BookPlan {
  bookId: string
  /** days=按天数背完（自动算额度） perDay=直接指定每日词数 */
  mode: 'days' | 'perDay'
  days: number
  perDay: number
}

export interface DayStat {
  /** 本地日期，`YYYY-MM-DD` */
  day: string
  reviewed: number
  newLearned: number
}

export interface AppSettings {
  currentBookId: string | null
  /** 收藏默认进的单词书：设置后学习时点 ✓ 直接收藏，不再弹窗询问 */
  collectBookId?: string
}

export const DEFAULT_SETTINGS: AppSettings = { currentBookId: null }

/** 复习间隔：同一个词两次复习至少隔 20 小时 */
export const REVIEW_INTERVAL_MS = 20 * 3600_000

class VocabDB extends Dexie {
  progress!: Table<WordProgress, string>
  stats!: Table<DayStat, string>
  settings!: Table<{ key: string; value: unknown }, string>
  plans!: Table<BookPlan, string>
  wordBooks!: Table<WordBookRow, string>
  cnCache!: Table<CnCacheRow, string>
  myBooks!: Table<MyBookRow, string>

  constructor() {
    super('offline-vocab')
    // v1 旧 FSRS 模型；v2 四遍通关制；v3 记词本改多本单词书
    this.version(1).stores({
      cards: 'id, bookId, dueMs, [bookId+dueMs]',
      stats: 'day',
      settings: 'key',
    })
    this.version(2).stores({
      progress: 'id, bookId, collected, stage, [bookId+collected], [bookId+stage]',
      stats: 'day',
      settings: 'key',
      plans: 'bookId',
    })
    this.version(3)
      .stores({
        progress: 'id, bookId, collectedIn, stage, [bookId+collected], [bookId+stage]',
        stats: 'day',
        settings: 'key',
        plans: 'bookId',
        wordBooks: 'id',
      })
      .upgrade(async (tx) => {
        const DEFAULT = 'wb_default'
        await tx.table('wordBooks').add({
          id: DEFAULT,
          name: '我的生词',
          createdAt: Date.now(),
          order: 0,
        })
        await tx
          .table('progress')
          .toCollection()
          .modify((row: Record<string, unknown>) => {
            row.collectedIn = row.collected ? DEFAULT : null
            delete row.collected
          })
      })
    // v4：在线翻译结果缓存（查过的整句翻译离线也能看）
    this.version(4).stores({
      progress: 'id, bookId, collectedIn, stage, [bookId+stage]',
      stats: 'day',
      settings: 'key',
      plans: 'bookId',
      wordBooks: 'id',
      cnCache: 'q',
    })
    // v5：从在线词库下载的词书
    this.version(5).stores({
      progress: 'id, bookId, collectedIn, stage, [bookId+stage]',
      stats: 'day',
      settings: 'key',
      plans: 'bookId',
      wordBooks: 'id',
      cnCache: 'q',
      myBooks: 'id, addedAt',
    })
  }
}

export const db = new VocabDB()

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get('app')
  return row ? { ...DEFAULT_SETTINGS, ...(row.value as Partial<AppSettings>) } : DEFAULT_SETTINGS
}

/**
 * 首次运行准备。
 *
 * v3 的 upgrade() 里建过一本默认的《我的生词》，但那只在"从旧版本升上来"时可靠；
 * 全新安装时 Dexie 直接按最新版本建库，那段没跑 —— 实测新用户打开记词本是空的。
 * 所以这里补一次，用一个 settings 标记保证只播种一次：
 * 用户自己把书全删了，不该下次打开又冒出来。
 */
export async function ensureSeedData(): Promise<void> {
  const seeded = await db.settings.get('seed')
  if (seeded) return
  if ((await db.wordBooks.count()) === 0) {
    await db.wordBooks.add({
      id: DEFAULT_WORD_BOOK,
      name: '我的生词',
      createdAt: Date.now(),
      order: 0,
    })
  }
  await db.settings.put({ key: 'seed', value: { at: Date.now() } })
}

export async function saveSettings(value: AppSettings): Promise<void> {
  await db.settings.put({ key: 'app', value })
}

export async function getPlan(bookId: string): Promise<BookPlan> {
  return (await db.plans.get(bookId)) ?? { bookId, mode: 'perDay', days: 0, perDay: 10 }
}

export async function savePlan(plan: BookPlan): Promise<void> {
  await db.plans.put(plan)
}

export function todayKey(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function bumpTodayStats(isNewWord: boolean): Promise<void> {
  const day = todayKey()
  await db.transaction('rw', db.stats, async () => {
    const cur = (await db.stats.get(day)) ?? { day, reviewed: 0, newLearned: 0 }
    cur.reviewed += 1
    if (isNewWord) cur.newLearned += 1
    await db.stats.put(cur)
  })
}

/** 连续打卡天数：从今天（或昨天）往前数有学习记录的天数 */
export async function getStreak(): Promise<number> {
  const all = (await db.stats.toArray())
    .filter((s) => s.reviewed + s.newLearned > 0)
    .map((s) => s.day)
    .sort()
    .reverse()
  if (all.length === 0) return 0
  const toTime = (day: string) => new Date(`${day}T12:00:00`).getTime()
  const DAY = 86400_000
  const today = toTime(todayKey())
  let streak = 0
  let cursor = toTime(all[0]) === today ? today : today - DAY
  for (const day of all) {
    if (toTime(day) === cursor) {
      streak += 1
      cursor -= DAY
    } else if (toTime(day) < cursor) {
      break
    }
  }
  return streak
}

export function progressId(bookId: string, word: string): string {
  return `${bookId}:${word}`
}

export async function ensureProgress(bookId: string, word: string, order: number): Promise<WordProgress> {
  const id = progressId(bookId, word)
  const existing = await db.progress.get(id)
  if (existing) return existing
  const rec: WordProgress = {
    id,
    bookId,
    word,
    order,
    stage: 0,
    wrong: 0,
    right: 0,
    collectedIn: null,
  }
  await db.progress.put(rec)
  return rec
}

/* ---------- 在线词库下载到本机的词书 ---------- */

export async function listMyBooks(): Promise<MyBookRow[]> {
  return (await db.myBooks.toArray()).sort((a, b) => a.addedAt - b.addedAt)
}

export async function getMyBook(id: string): Promise<MyBookRow | undefined> {
  return db.myBooks.get(id)
}

export async function saveMyBook(row: MyBookRow): Promise<void> {
  await db.myBooks.put(row)
}

/** 删掉下载的词书。已经学过的进度保留，只是词书本体没了 */
export async function deleteMyBook(id: string): Promise<void> {
  await db.myBooks.delete(id)
}

/* ---------- 单词书 ---------- */

export async function listWordBooks(): Promise<WordBookRow[]> {
  return (await db.wordBooks.toArray()).sort((a, b) => a.order - b.order)
}

export async function createWordBook(name: string): Promise<WordBookRow> {
  const all = await listWordBooks()
  const row: WordBookRow = {
    id: `wb_${Date.now().toString(36)}`,
    name: name.trim() || '未命名',
    createdAt: Date.now(),
    order: (all[all.length - 1]?.order ?? 0) + 1,
  }
  await db.wordBooks.add(row)
  return row
}

/** 删书：书内单词只是取消收藏，学习记录保留 */
export async function deleteWordBook(id: string): Promise<void> {
  await db.transaction('rw', [db.wordBooks, db.progress], async () => {
    await db.wordBooks.delete(id)
    await db.progress.where('collectedIn').equals(id).modify({ collectedIn: null })
  })
}

/** 收藏 / 取消收藏到指定单词书 */
export async function setCollect(
  bookId: string,
  word: string,
  order: number,
  wordBookId: string | null,
): Promise<void> {
  const rec = await ensureProgress(bookId, word, order)
  rec.collectedIn = wordBookId
  await db.progress.put(rec)
}

/** 新增/更新一个自定义词（首页手动添加），并收藏到指定单词书 */
export async function upsertCustomWord(
  word: string,
  data: CustomWordData | null,
  wordBookId: string | null,
): Promise<WordProgress> {
  const rec = await ensureProgress(CUSTOM_BOOK, word, Date.now())
  if (data) rec.customData = data
  rec.collectedIn = wordBookId
  await db.progress.put(rec)
  return rec
}
