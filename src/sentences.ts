/** 例句库（public/sentences.json，由数据管道生成） */

/** 句中出现的短语/搭配：p=英文短语，zh=中文含义 */
export interface SentencePhrase {
  p: string
  zh: string
}

export interface SentenceEntry {
  /** 英文例句 */
  en: string
  /** 例句中文翻译（可能缺失；缺失时 UI 用在线翻译兜底） */
  zh?: string
  /** 固定搭配：如 "cancel out 抵消"（老字段，可能缺失） */
  phr?: string
  /** 短语搭配标注（build 管道扫描常用短语表生成） */
  phrases?: SentencePhrase[]
  /** 句子结构讲解：被动句 / 从句 / 比较结构等（build 管道按规则检测生成） */
  gr?: string
  /** 例句来源：gpt4=DictionaryByGPT4 ew=4000EW tatoeba=Tatoeba 人工翻译(CC-BY) ted=TED2020 字幕(CC BY-NC-ND) ai=AI 生成 */
  src?: 'gpt4' | 'ew' | 'tatoeba' | 'ted' | 'ai'
}

export interface SentencesData {
  /** 词 -> 例句 */
  s: Record<string, SentenceEntry>
  /** 逐词释义表（例句讲解用）：token -> 简短中文 */
  g: Record<string, string>
  /** 速记法（词根词缀拆解）：词 -> 讲解文本 */
  m: Record<string, string>
  /** 词 -> 常用短语搭配（词典卡讲解用） */
  p?: Record<string, SentencePhrase[]>
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
