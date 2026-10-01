import { useEffect, useState } from 'react'
import { loadSentences, EMPTY_SENTENCES, type SentencesData } from '../sentences'

/** 例句/速记/逐词释义 共享数据（模块级缓存，一次加载） */
export function useSentenceData(): SentencesData {
  const [data, setData] = useState<SentencesData>(EMPTY_SENTENCES)
  useEffect(() => {
    let alive = true
    loadSentences()
      .then((d) => alive && setData(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return data
}
