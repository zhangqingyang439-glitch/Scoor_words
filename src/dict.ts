import type { Sense } from './books'

/** 高频释义库（public/dict.json，数据管道生成），首页手动添加单词时自动查释义 */
export interface DictEntry {
  senses: Sense[]
  usphone?: string
  ukphone?: string
  forms?: string[]
}

let cache: Promise<Record<string, DictEntry>> | null = null

export function loadDict(): Promise<Record<string, DictEntry>> {
  if (!cache) {
    cache = fetch('/dict.json').then((res) => {
      if (!res.ok) throw new Error(`加载释义库失败: ${res.status}`)
      return res.json() as Promise<Record<string, DictEntry>>
    })
  }
  return cache
}
