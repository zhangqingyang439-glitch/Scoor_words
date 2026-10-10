import { useEffect, useState } from 'react'
import { BOOKS, loadBook, type Sense } from '../books'
import { loadDict } from '../dict'
import { loadSentences, type SentenceEntry, type SentencePhrase } from '../sentences'
import { SpeakButton } from './SpeakButton'

/** 词书收录信息：该词在某个内置词书里的序位 */
export interface BookPresence {
  id: string
  name: string
  order: number
  count: number
}

export interface DictCardData {
  word: string
  usphone?: string
  senses: Sense[]
  mnem?: string
  sentence?: SentenceEntry
  /** 该词的常用短语搭配（sentences.json 的 p 表） */
  phrases?: SentencePhrase[]
  /** 词形变化（works · worked · working） */
  forms?: string[]
  /** 近义词（WordNet 同词集，按常用度排） */
  syn?: string[]
  /** 收录在哪些内置词书（含序位） */
  books?: BookPresence[]
  source: 'dict' | 'book' | 'none'
}

/** 任意单词的词典卡数据：高频释义库 → 三本词书 → 速记/例句/短语补充 */
export async function lookupWordCard(raw: string): Promise<DictCardData | null> {
  const word = raw.toLowerCase().replace(/[^a-z'-]/g, '')
  if (!word) return null
  const [dict, sdata] = await Promise.all([loadDict(), loadSentences()])
  const dictEntry = dict[word]
  const mnem = sdata.m[word]
  const sentence = sdata.s[word]
  const phrases = sdata.p?.[word]
  const syn = dictEntry?.syn

  let senses: Sense[] | undefined
  let usphone: string | undefined
  let forms: string[] | undefined
  let source: DictCardData['source'] = 'none'

  if (dictEntry) {
    senses = dictEntry.senses
    usphone = dictEntry.usphone
    forms = dictEntry.forms
    source = 'dict'
  } else {
    // 三本词书里找（都有模块缓存）
    for (const b of BOOKS) {
      try {
        const words = await loadBook(b)
        const hit = words.find((x) => x.name.toLowerCase() === word)
        if (hit) {
          senses = hit.senses ?? hit.trans.map((t) => ({ pos: '释义', zh: [t] }))
          usphone = hit.usphone
          forms = hit.forms
          source = 'book'
          break
        }
      } catch {
        // 忽略加载失败
      }
    }
  }

  // 词书收录（bk 存的是 "书id:序位"，映射成书名 + 第几个词）
  const books: BookPresence[] | undefined = dictEntry?.bk
    ?.map((s) => {
      const [id, ord] = s.split(':')
      const b = BOOKS.find((x) => x.id === id)
      return b ? { id, name: b.name, order: Number(ord) + 1, count: b.count } : null
    })
    .filter((b): b is BookPresence => b !== null)

  if (!senses && !mnem && !sentence && !phrases && !syn && !(books && books.length)) return null
  return {
    word,
    usphone,
    senses: senses ?? [],
    mnem,
    sentence,
    phrases,
    forms,
    syn,
    books: books && books.length > 0 ? books : undefined,
    source,
  }
}

/** 词典条目内容（词典卡与首页查词共用） */
export function DictEntryView({ data }: { data: DictCardData }) {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold">{data.word}</span>
        <SpeakButton word={data.word} size="lg" />
        {data.usphone && <span className="text-sm text-zinc-400">/{data.usphone}/</span>}
      </div>

      {data.senses.length > 0 && (
        <div className="mt-4 space-y-2 text-left">
          {data.senses.map((s, i) => (
            <p key={i} className="rounded-lg bg-zinc-50 px-4 py-2">
              <span className="mr-2 text-xs font-medium text-emerald-600">{s.pos}</span>
              <span className="text-zinc-700">{s.zh.join('；')}</span>
            </p>
          ))}
        </div>
      )}

      {data.mnem && (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-left">
          <div className="text-xs font-medium text-amber-500">🧠 速记法</div>
          <div className="mt-1 text-sm leading-relaxed text-zinc-600">{data.mnem}</div>
        </div>
      )}

      {data.phrases && data.phrases.length > 0 && (
        <div className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-left">
          <div className="text-xs font-medium text-sky-500">常用短语</div>
          <div className="mt-2 space-y-1">
            {data.phrases.map((ph) => (
              <p key={ph.p} className="text-sm">
                <span className="font-medium text-zinc-800">{ph.p}</span>
                <span className="ml-2 text-zinc-500">{ph.zh}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {data.sentence && (
        <div className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-left">
          <div className="text-xs font-medium text-sky-500">例句</div>
          <div className="mt-1 text-sm text-zinc-700">{data.sentence.en}</div>
          {data.sentence.zh && <div className="mt-1 text-sm text-zinc-500">{data.sentence.zh}</div>}
        </div>
      )}

      {!data.senses.length && !data.mnem && data.sentence && (
        <p className="mt-3 text-xs text-zinc-400">该词暂无释义数据，仅有例句</p>
      )}

      {(data.forms?.length || data.syn?.length || data.books?.length) && (
        <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-left">
          {data.forms && data.forms.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-400">词形变化</div>
              <div className="mt-1 text-sm text-zinc-700">{data.forms.join(' · ')}</div>
            </div>
          )}
          {data.syn && data.syn.length > 0 && (
            <div className={data.forms?.length ? 'mt-3' : ''}>
              <div className="text-xs font-medium text-zinc-400">近义词</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {data.syn.map((s) => (
                  <span key={s} className="rounded-full bg-card px-2.5 py-0.5 text-xs text-zinc-600 ring-1 ring-zinc-200">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
          {data.books && data.books.length > 0 && (
            <div className={data.forms?.length || data.syn?.length ? 'mt-3' : ''}>
              <div className="text-xs font-medium text-zinc-400">收录在</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
                {data.books.map((b) => (
                  <span key={b.id}>
                    <span className="font-medium text-zinc-700">{b.name}</span>
                    <span className="ml-1 text-zinc-400">
                      第 {b.order} / {b.count} 词
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

/** 底部弹出的词典卡 */
export function DictCard({ word, onClose }: { word: string; onClose: () => void }) {
  const [data, setData] = useState<DictCardData | null | undefined>(undefined) // undefined=加载中

  useEffect(() => {
    let alive = true
    setData(undefined)
    lookupWordCard(word)
      .then((d) => alive && setData(d))
      .catch(() => alive && setData(null))
    return () => {
      alive = false
    }
  }, [word])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[75vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {data === undefined ? (
          <p className="py-10 text-center text-sm text-zinc-400">查询中…</p>
        ) : data === null ? (
          <div className="py-10 text-center">
            <p className="text-4xl">🔍</p>
            <p className="mt-3 text-sm text-zinc-500">
              「{word}」未收录释义库
              <br />
              <span className="text-xs text-zinc-400">可以在首页把它添加进单词书</span>
            </p>
          </div>
        ) : (
          <>
            <DictEntryView data={data} />
            <button onClick={onClose} className="mt-5 w-full rounded-xl bg-zinc-100 py-2.5 text-sm text-zinc-500">
              关闭
            </button>
          </>
        )}
      </div>
    </div>
  )
}
