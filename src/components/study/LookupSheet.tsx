import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getBook, loadBook } from '../../books'
import type { Sense } from '../../books'
import { DEFAULT_WORD_BOOK, ensureProgress, listWordBooks, setCollect, upsertCustomWord } from '../../db'
import { cacheCNTranslation, getCachedCN, loadCnIndex, translateOnline, type CnCandidate } from '../../cn'
import { normalizeEn, normalizeZh } from '../../match'
import { DictEntryView, lookupWordCard, type DictCardData } from '../DictCard'
import { SpeakButton } from '../SpeakButton'

/**
 * 学习页的查词面板：背单词途中随手查词。
 * 英文出词典卡（释义/速记法/例句），中文出候选英文词；
 * 都没有时联网在线翻译兜底（结果缓存，离线可复看）。
 * 查到的词可以收藏进任意一本单词书，下次学习就会出现。
 */
export default function LookupSheet({
  studyBookId,
  onClose,
}: {
  /** 当前学习会话的词书：查到的词如果属于这本书，收藏时直接进进度记录 */
  studyBookId: string | null
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [data, setData] = useState<DictCardData | null | undefined>(undefined) // undefined=还没查
  const [word, setWord] = useState('')
  const [cands, setCands] = useState<CnCandidate[]>([])
  const [online, setOnline] = useState<string | undefined>(undefined)
  /** 在线兜底结果里真正能收藏的词形（中文查询=英文翻译，英文查询=原词） */
  const [fallbackWord, setFallbackWord] = useState<string | null>(null)
  const [pickBook, setPickBook] = useState<string>(DEFAULT_WORD_BOOK)
  const books = useLiveQuery(() => listWordBooks(), [])

  /** 候选短语（含空格且词典查不到）也能出卡：显示短语 + 中文含义 */
  async function resolveCandidate(w: string): Promise<DictCardData | undefined> {
    const d = (await lookupWordCard(w)) ?? undefined
    if (!d && /\s/.test(w)) {
      return { word: w, senses: [{ pos: '短语', zh: [w] }], source: 'none' }
    }
    return d
  }

  async function search(q?: string) {
    const text = (q ?? query).trim()
    if (!text || busy) return
    setBusy(true)
    setMsg('')
    try {
      if (/[\u4e00-\u9fff]/.test(text)) {
        const key = normalizeZh(text)
        const cn = await loadCnIndex()
        const list = cn[key] ?? []
        setCands(list)
        const first = list[0]?.w
        setWord(first ?? '')
        setData(first ? ((await resolveCandidate(first)) ?? null) : null)
        setOnline(undefined)
        if (!first && navigator.onLine) {
          const cached = await getCachedCN(text)
          const t = cached ?? (await translateOnline(text, 'zh-en')) ?? undefined
          if (t && !cached) await cacheCNTranslation(text, t)
          setOnline(t)
          setFallbackWord(t ?? null)
        }
      } else {
        const w = normalizeEn(text)
        setWord(w)
        setCands([])
        const d = (await resolveCandidate(w)) ?? null
        setData(d)
        // 未收录 → 在线翻成中文兜底（联网时）
        let t: string | undefined
        if (!d && navigator.onLine) {
          t = (await getCachedCN(text)) ?? (await translateOnline(text, 'en-zh')) ?? undefined
          if (t) await cacheCNTranslation(text, t)
        }
        setOnline(t)
        setFallbackWord(w)
      }
    } finally {
      setBusy(false)
    }
  }

  /** 收藏：词书里的词直接收藏进度；书外的建自定义词 */
  async function addToBook() {
    if (!word) return
    const bookName = books?.find((b) => b.id === pickBook)?.name ?? ''
    const cur = studyBookId ? getBook(studyBookId) : null
    if (cur) {
      const words = await loadBook(cur)
      const idx = words.findIndex((x) => x.name.toLowerCase() === word)
      if (idx >= 0) {
        await ensureProgress(cur.id, words[idx].name, idx)
        await setCollect(cur.id, words[idx].name, idx, pickBook)
        setMsg(`「${words[idx].name}」是词书里的词，已收藏进《${bookName}》`)
        return
      }
    }
    const senses: Sense[] = data?.senses ?? []
    const extra = data?.usphone ? { usphone: data.usphone } : {}
    await upsertCustomWord(word, senses.length > 0 ? { senses, ...extra } : null, pickBook)
    setMsg(`已把「${word}」加进《${bookName}》，下次学习时出现`)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--app-bg)]" onClick={onClose}>
      <div className="flex h-full flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3">
          <button onClick={onClose} className="text-sm text-zinc-400">
            ← 返回
          </button>
          <div className="flex-1 text-center font-medium">查词</div>
          <span className="w-12" />
        </header>

        <div className="shrink-0 px-4 pt-3">
          <div className="flex h-[46px] items-center rounded-[10px] border border-zinc-300 pl-3.5 transition-colors focus-within:border-zinc-900">
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setMsg('')
              }}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="输入英文或中文，如 apple / 苹果"
              className="min-w-0 flex-1 bg-transparent font-title text-[15px] outline-none"
            />
            <button
              onClick={() => search()}
              disabled={busy || !query.trim()}
              className="h-[28px] shrink-0 border-l border-zinc-200 px-3.5 text-[13px] font-medium text-zinc-900 disabled:opacity-40"
            >
              {busy ? '查询中' : '搜索'}
            </button>
          </div>
          {msg && <p className="mt-2 text-xs text-emerald-600">{msg}</p>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-3">
          {data === undefined ? (
            <p className="mt-16 text-center text-sm text-zinc-400">背单词途中也能随手查词、收藏</p>
          ) : data ? (
            <div className="rounded-2xl bg-card p-5 shadow-sm">
              {cands.length > 1 && (
                <div className="mb-3">
                  <div className="mb-1 text-xs text-zinc-400">「{query.trim()}」的候选英文词（点击切换）</div>
                  <div className="space-y-1.5">
                    {cands.map((c) => (
                      <button
                        key={c.w + (c.m ?? '')}
                        onClick={async () => {
                          setWord(c.w)
                          setData((await resolveCandidate(c.w)) ?? null)
                        }}
                        className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                          word === c.w ? 'bg-emerald-100 ring-1 ring-emerald-400' : 'bg-card'
                        }`}
                      >
                        <span className={`font-semibold ${word === c.w ? 'text-emerald-600' : 'text-zinc-800'}`}>{c.w}</span>
                        {c.m && <span className="truncate text-xs text-zinc-400">{c.m}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <DictEntryView data={data} />
              <div className="mt-4">
                <div className="mb-1.5 text-xs text-zinc-400">收藏到</div>
                <div className="flex flex-wrap gap-1.5">
                  {(books ?? []).map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setPickBook(b.id)}
                      className={`rounded-full px-3 py-1 text-xs ${
                        pickBook === b.id ? 'bg-inverse text-inverse-ink' : 'bg-card text-zinc-500 ring-1 ring-zinc-200'
                      }`}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={addToBook} className="mt-3 w-full rounded-xl bg-inverse py-2.5 text-sm font-medium text-inverse-ink active:bg-inverse/85">
                添加进单词书
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-card p-5 text-center shadow-sm">
              {online ? (
                <>
                  <div className="text-xs font-medium text-emerald-600">翻译结果（在线翻译 · 已缓存可离线查看）</div>
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <span className="text-base font-medium text-zinc-800">{online}</span>
                    <SpeakButton word={online} size="sm" />
                  </div>
                  <button
                    onClick={() => {
                      if (!fallbackWord) return
                      setWord(fallbackWord)
                      setData({ word: fallbackWord, senses: [], source: 'none' })
                    }}
                    className="mt-4 text-xs text-zinc-400 underline"
                  >
                    仍要把「{fallbackWord ?? query.trim()}」加进单词书
                  </button>
                </>
              ) : (
                <>
                  <p className="text-4xl">🔍</p>
                  <p className="mt-3 text-sm text-zinc-500">词库里没有与「{query.trim()}」匹配的释义</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {navigator.onLine ? '换个说法试试，或直接搜它的英文' : '当前离线，联网后再试可启用在线翻译'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
