/** 例句库（public/sentences.json，由数据管道生成） */

export interface SentenceEntry {
  /** 英文例句 */
  en: string
  /** 例句中文翻译（可能缺失） */
  zh?: string
  /** 固定搭配：如 "cancel out 抵消"（可能缺失） */
  phr?: string
}

export interface SentencesData {
  /** 词 -> 例句 */
  s: Record<string, SentenceEntry>
  /** 逐词释义表（例句讲解用）：token -> 简短中文 */
  g: Record<string, string>
  /** 速记法（词根词缀拆解）：词 -> 讲解文本 */
  m: Record<string, string>
}

const EMPTY: SentencesData = { s: {}, g: {}, m: {} }
let cache: Promise<SentencesData> | null = null

export function loadSentences(): Promise<SentencesData> {
  if (!cache) {
    cache = fetch('/sentences.json').then((res) => {
      if (!res.ok) throw new Error(`加载例句库失败: ${res.status}`)
      return res.json() as Promise<SentencesData>
    })
  }
  return cache
}

export { EMPTY as EMPTY_SENTENCES }
