import { db } from './db'

/** 中→英反向索引（public/cn.json，数据管道生成）：中文释义 -> 候选英文词（带匹配释义） */

export interface CnCandidate {
  w: string
  /** 匹配到的词性释义（基础补充词可能没有） */
  m?: string
}

let cache: Promise<Record<string, CnCandidate[]>> | null = null

export function loadCnIndex(): Promise<Record<string, CnCandidate[]>> {
  if (!cache) {
    cache = fetch('/cn.json').then((res) => {
      if (!res.ok) throw new Error(`加载中文索引失败: ${res.status}`)
      return res.json() as Promise<Record<string, unknown[]>>
    }).then((raw) => {
      // 归一化：兼容 "word" 与 [word, 释义] 两种条目
      const out: Record<string, CnCandidate[]> = {}
      for (const [k, list] of Object.entries(raw)) {
        out[k] = (list as unknown[]).map((e) =>
          Array.isArray(e) ? { w: String(e[0]), m: e[1] ? String(e[1]) : undefined } : { w: String(e) },
        )
      }
      return out
    })
  }
  return cache
}

/** 整句翻译索引（public/zhsent.json）：归一化中文句 -> 英文原句 */
export interface ZhSentEntry {
  en: string
  word: string
}

let zhSentCache: Promise<Record<string, ZhSentEntry>> | null = null

export function loadZhSent(): Promise<Record<string, ZhSentEntry>> {
  if (!zhSentCache) {
    zhSentCache = fetch('/zhsent.json').then((res) => {
      if (!res.ok) throw new Error(`加载整句索引失败: ${res.status}`)
      return res.json() as Promise<Record<string, ZhSentEntry>>
    })
  }
  return zhSentCache
}

/** 在线翻译兜底（MyMemory 免费接口，仅联网时调用），并缓存进 IndexedDB 供离线复用 */
export async function translateOnline(q: string, pair: 'zh-en' | 'en-zh'): Promise<string | null> {
  try {
    const pairTag = pair === 'zh-en' ? 'zh-CN|en-GB' : 'en-GB|zh-CN'
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${pairTag}`)
    if (!res.ok) return null
    const j = (await res.json()) as { responseData?: { translatedText?: string } }
    const t = j?.responseData?.translatedText?.trim() ?? ''
    if (!t || /MYMEMORY WARNING|INVALID|QUERY LENGTH/i.test(t)) return null
    return t
  } catch {
    return null
  }
}

/** 查询在线翻译的本地缓存 */
export async function getCachedCN(q: string): Promise<string | undefined> {
  try {
    return (await db.cnCache.get(q.trim()))?.result
  } catch {
    return undefined
  }
}

export async function cacheCNTranslation(q: string, result: string): Promise<void> {
  try {
    await db.cnCache.put({ q: q.trim(), result, at: Date.now() })
  } catch {
    // 缓存失败不影响主流程
  }
}
