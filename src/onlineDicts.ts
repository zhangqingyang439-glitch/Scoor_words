import catalog from './data/onlineDicts.json'
import type { BookWord } from './books'
import { saveMyBook, type MyBookRow } from './db'

/**
 * 在线词库。
 *
 * 词库本身来自 qwerty-learner 这个开源项目（MIT），它把几百本词典整理成了
 * 统一的 `[{ name, trans }]` 格式 —— 和本 App 的 BookWord 字段几乎一样，
 * 所以能直接拿来用，不用做转换。
 *
 * 取文件走 jsDelivr 的 CDN（国内不开梯子也能访问，实测过）。
 * 下载一次就整本存进 IndexedDB，之后完全离线。
 */

export interface OnlineDict {
  id: string
  name: string
  cat: string
  /** 仓库里的文件名 */
  file: string
}

export const ONLINE_DICTS = catalog as OnlineDict[]

export const CATEGORIES = [...new Set(ONLINE_DICTS.map((d) => d.cat))]

const CDN = 'https://cdn.jsdelivr.net/gh/Kaiyiwing/qwerty-learner@master/public/dicts/'
const RAW = 'https://raw.githubusercontent.com/Kaiyiwing/qwerty-learner/master/public/dicts/'

/** 源站返回的原始条目 */
interface RawWord {
  name: string
  trans?: string[]
  /** 日语假名那批用这个字段，没有 trans */
  notation?: string
  usphone?: string
  ukphone?: string
}

function clean(raw: RawWord): { name: string; trans: string[]; notation: string } {
  return {
    name: (raw.name ?? '').trim(),
    trans: Array.isArray(raw.trans) ? raw.trans.filter((t) => typeof t === 'string' && t.trim()) : [],
    notation: typeof raw.notation === 'string' ? raw.notation.trim() : '',
  }
}

function toBookWord(raw: RawWord, swap: boolean): BookWord | null {
  const c = clean(raw)
  // 日语假名那批整本都没有 trans，字在 notation 里、罗马音在 name 里。
  // 背假名要认的是那个字，所以整本对调：字当词、罗马音当释义。
  const word = swap ? c.notation : c.name
  const meaning = swap ? (c.name ? [c.name] : []) : c.trans.length ? c.trans : c.notation ? [c.notation] : []
  if (!word || meaning.length === 0) return null
  return {
    name: word,
    trans: meaning,
    ...(raw.usphone ? { usphone: raw.usphone } : {}),
    ...(raw.ukphone ? { ukphone: raw.ukphone } : {}),
  }
}

/**
 * 下载并解析一本在线词库。
 * jsDelivr 挂了就退回 GitHub 原始地址 —— 两条路都断才算真失败。
 */
export async function downloadDict(dict: OnlineDict, onProgress?: (msg: string) => void): Promise<MyBookRow> {
  let lastErr: unknown = null
  for (const base of [CDN, RAW]) {
    try {
      onProgress?.(`正在下载 ${dict.name}…`)
      const res = await fetch(base + dict.file)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = (await res.json()) as RawWord[]
      onProgress?.(`正在整理 ${dict.name}…`)
      const swap = raw.length > 0 && raw.every((w) => clean(w).trans.length === 0 && clean(w).notation)
      const words = raw.map((w) => toBookWord(w, swap)).filter((w): w is BookWord => w !== null)
      if (words.length === 0) throw new Error('这本词库是空的')
      const row: MyBookRow = {
        id: dict.id,
        name: dict.name,
        description: `${dict.cat} · 来自在线词库`,
        category: dict.cat,
        count: words.length,
        words,
        addedAt: Date.now(),
      }
      await saveMyBook(row)
      return row
    } catch (e) {
      lastErr = e
    }
  }
  throw new Error(`下载失败：${lastErr instanceof Error ? lastErr.message : '网络不通'}`)
}
