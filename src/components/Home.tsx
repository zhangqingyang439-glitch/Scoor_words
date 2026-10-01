import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getBook, loadBook } from '../books'
import type { Sense } from '../books'
import {
  db,
  DEFAULT_WORD_BOOK,
  ensureProgress,
  getSettings,
  getStreak,
  listWordBooks,
  setCollect,
  todayKey,
  upsertCustomWord,
} from '../db'
import { DictEntryView, lookupWordCard, type DictCardData } from './DictCard'
import { SpeakButton } from './SpeakButton'
import { speakZh } from './speech'
import { cacheCNTranslation, getCachedCN, loadCnIndex, loadZhSent, translateOnline, type CnCandidate } from '../cn'
import { todayCounts, type TodayCounts } from '../study'
import { normalizeEn, normalizeZh, splitPosLine, meaningVariants } from '../match'

/** 查词结果：en=英文查释义；cn=中文反查候选（带匹配释义）+ 整句翻译 + 在线兜底 */
interface SearchResult {
  kind: 'en' | 'cn'
  word?: string
  data?: DictCardData
  candidates?: CnCandidate[]
  sentHits?: Array<{ zh: string; en: string }>
  online?: string
  found: boolean
  manualText?: string
}

/** logo 底下的励志短语：每次进首页随机来一句（收集自励志名言与学习打卡文案） */
const TAGLINES = [
  '今天记住的，明天还在',
  '背过的词，不会白背',
  '和遗忘曲线硬碰硬',
  '一词四遍，暂别生词',
  '断网，也挡不住背单词',
  '把单词写进长期记忆',
  '今天多背一个，明天少错一个',
  '你看课文里的每个生词，都该来这报到',
  '复习不是重复，是和遗忘赛跑',
  '不积跬步，无以至千里',
  '重复是学习之母',
  '聪明在于勤奋，天才在于积累',
  '学而不思则罔，思而不学则殆',
  '书山有路勤为径，学海无涯苦作舟',
  '学不可以已',
  '坚持到为自己骄傲的那一天',
  '今天的词汇量，是明天的底气',
  '记单词的最佳时间是昨天，其次是现在',
  '平凡与卓越的差距，在于那一点额外的坚持',
  '别怕忘，每一次重复都在加固记忆',
  '积少成多，聚沙成塔',
  '再试一次，你就赢了',
  '贵有恒，何必三更眠五更起',
  '最无益，只怕一日曝十日寒',
  '每天背 10 个，一个月就是 300 个',
  '今天的通关数 +1',
  'Don’t stop until you’re proud.',
  '坚持的秘诀：让开始变得毫不费力',
]

function parseSensesText(text: string): Sense[] {
  const out: Sense[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const { pos, text: body } = splitPosLine(t)
    const zh = meaningVariants(body)
    if (zh.length > 0) out.push({ pos: pos ?? '释义', zh })
  }
  return out
}

/** 四遍通关的四个阶段（首页说明区用） */
const PASSES = [
  { n: '一', t: '极速记忆' },
  { n: '二', t: '按词性填义' },
  { n: '三', t: '看义默写' },
  { n: '四', t: '例句翻译' },
]

/** 组合标：冰淇淋图标 + scoop words + yyovo（内联 SVG，桌面单文件版也能显示） */
function LogoMark() {
  return (
    <svg viewBox="0 0 350 64" className="h-10 w-auto text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)]" aria-label="scoop words">
      <g transform="translate(6,6)">
        <path d="M14 26 L34 26 L24 46 Z" fill="#d97706" />
        <circle cx="24" cy="20" r="10" fill="#10b981" />
        <circle cx="18" cy="11" r="7" fill="#10b981" />
        <circle cx="30" cy="11" r="7" fill="#f9a8d4" />
      </g>
      {/* 品牌字用宋体，yyovo 拉开字距当 maker 标记。
          "scoop words" 比原来的「雪糕」宽得多（实测算下来约 204 个单位），
          x=236 会和它撞上，所以 viewBox 加宽到 350、yyovo 挪到 280。 */}
      <text
        x="56"
        y="44"
        fontFamily="Songti SC, Noto Serif SC, Source Han Serif SC, Cambria, Georgia, serif"
        fontSize="30"
        fontWeight="400"
        fill="currentColor"
        letterSpacing="0.5"
      >
        scoop words
      </text>
      <text x="280" y="43" fontFamily="Segoe UI, Verdana, sans-serif" fontSize="15" fontWeight="400" fill="#a1a1aa" letterSpacing="2.5">
        yyovo
      </text>
    </svg>
  )
}

export default function Home({
  onStart,
  onGoBooks,
}: {
  onStart: (extra: boolean) => void
  onGoBooks: () => void
}) {
  const today = todayKey()
  const stat = useLiveQuery(() => db.stats.get(today), [today])
  const streak = useLiveQuery(() => getStreak(), [])
  const [bookId, setBookId] = useState<string | null | undefined>(undefined)
  const [counts, setCounts] = useState<TodayCounts | null>(null)

  const [query, setQuery] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [pickBook, setPickBook] = useState<string>(DEFAULT_WORD_BOOK)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const books = useLiveQuery(() => listWordBooks(), [])
  // 每次进首页随机换一句
  const [tagline] = useState(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)])

  useEffect(() => {
    getSettings().then((s) => setBookId(s.currentBookId))
  }, [])

  useEffect(() => {
    let alive = true
    if (!bookId) {
      setCounts(null)
      return
    }
    todayCounts(bookId)
      .then((c) => alive && setCounts(c))
      .catch(() => alive && setCounts(null))
    return () => {
      alive = false
    }
  }, [bookId, stat])

  const book = getBook(bookId)
  const quota = counts?.quota ?? 0
  const hasTask = (counts?.remainingNew ?? 0) > 0 || (counts?.resumeCount ?? 0) > 0 || (counts?.reviewAvailable ?? 0) > 0
  const label = !book
    ? '先选一本词书'
    : (counts?.resumeCount ?? 0) > 0
      ? '接着学习 ↷'
      : hasTask
        ? '开始学习'
        : '继续加背 +'

  /** 候选短语（含空格且词典查不到）也能出卡：显示短语 + 中文含义 */
  async function resolveCandidate(w: string): Promise<DictCardData | undefined> {
    const d = (await lookupWordCard(w)) ?? undefined
    if (!d && /\s/.test(w)) {
      return { word: w, senses: [{ pos: '短语', zh: [query.trim()] }], source: 'none' }
    }
    return d
  }

  /** 查词：自动识别中英文。英文→词典卡；中文→反查候选英文词 + 整句翻译 + 在线兜底 */
  async function submitSearch() {
    const q = query.trim()
    if (!q || busy) return
    setBusy(true)
    setMsg('')
    try {
      if (/[\u4e00-\u9fff]/.test(q)) {
        const key = normalizeZh(q)
        const cn = await loadCnIndex()
        const candidates = cn[key] ?? []
        const word = candidates[0]?.w
        const data = word ? await resolveCandidate(word) : undefined
        // 整句翻译：本地例句库（精确 + 包含匹配）
        const zsent = await loadZhSent()
        const sentHits = Object.entries(zsent)
          .filter(([k]) => k === key || (key.length >= 3 && (k.includes(key) || key.includes(k))))
          .slice(0, 6)
          .map(([k, v]) => ({ zh: k, en: v.en }))
        // 都没有 → 在线翻译兜底（联网时），结果缓存离线可查
        let online: string | undefined
        if (candidates.length === 0 && sentHits.length === 0) {
          online = (await getCachedCN(q)) ?? undefined
          if (!online && navigator.onLine) {
            const t = await translateOnline(q, 'zh-en')
            if (t) {
              online = t
              await cacheCNTranslation(q, t)
            }
          }
        }
        setResult({ kind: 'cn', word, data, candidates, sentHits, online, found: candidates.length > 0 })
      } else {
        const w = normalizeEn(q)
        const data = (await lookupWordCard(w)) ?? undefined
        // 英文未收录 → 在线翻成中文兜底（联网时）
        let online: string | undefined
        if (!data && navigator.onLine) {
          online = (await getCachedCN(q)) ?? undefined
          if (!online) {
            const t = await translateOnline(q, 'en-zh')
            if (t) {
              online = t
              await cacheCNTranslation(q, t)
            }
          }
        }
        setResult({ kind: 'en', word: w, data, online, found: !!data })
      }
    } finally {
      setBusy(false)
    }
  }

  /** 把查到的词加进单词书（词书内的直接收藏，书外的建自定义词） */
  async function addToBook() {
    if (!result) return
    const w = result.word ?? ''
    if (!w) return
    const bookName = books?.find((b) => b.id === pickBook)?.name ?? ''
    const cur = getBook(bookId)
    if (cur) {
      const words = await loadBook(cur)
      const idx = words.findIndex((x) => x.name.toLowerCase() === w)
      if (idx >= 0) {
        await ensureProgress(cur.id, words[idx].name, idx)
        await setCollect(cur.id, words[idx].name, idx, pickBook)
        setMsg(`「${words[idx].name}」是词书里的词，已收藏进《${bookName}》`)
        setResult(null)
        setQuery('')
        return
      }
    }
    const senses = result.data?.senses ?? []
    const extra = result.data?.usphone ? { usphone: result.data.usphone } : {}
    await upsertCustomWord(w, senses.length > 0 ? { senses, ...extra } : null, pickBook)
    setMsg(`已把「${w}」加进《${bookName}》，下次学习时出现`)
    setResult(null)
    setQuery('')
  }

  /** 未收录的词：手填释义入库 */
  async function addManual() {
    if (!result || !result.word) return
    const senses = parseSensesText(result.manualText ?? '')
    if (senses.length === 0) {
      setMsg('请至少写一条释义（格式：n. 释义）')
      return
    }
    await upsertCustomWord(result.word, { senses }, pickBook)
    const bookName = books?.find((b) => b.id === pickBook)?.name ?? ''
    setMsg(`已把「${result.word}」加进《${bookName}》，下次学习时出现`)
    setResult(null)
    setQuery('')
  }

  return (
    <div className="pointer-events-none flex flex-col">
      <header>
        <LogoMark />
        <p className="mt-2 font-title text-[15px] leading-relaxed text-white/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
          {tagline}
        </p>
      </header>

      {/* 今日：当天目标提到最大字号当主角，另外两个指标用竖发丝线分列。
          首页铺了一层 3D 水面，内容区块都是浮在水面上的磨砂玻璃卡 */}
      <section className="pointer-events-auto mt-7 rounded-3xl border border-white/50 bg-card/70 p-5 shadow-xl shadow-black/10 backdrop-blur-xl">
        <h2 className="text-[13px] font-medium tracking-[0.08em] text-zinc-500">今日新词</h2>
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="ml-[-0.06em] font-title text-[72px] leading-[0.92] tracking-[-0.02em] text-zinc-900">
            {counts?.todayNew ?? stat?.newLearned ?? 0}
          </span>
          {quota > 0 && <span className="font-title text-[22px] text-zinc-400">/ {quota}</span>}
        </p>
        <div className="mt-5 grid grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="font-title text-[26px] leading-none text-zinc-900">{counts?.reviewAvailable ?? 0}</span>
            <span className="text-xs text-zinc-500">待复习</span>
          </div>
          <div className="flex flex-col gap-1.5 border-l border-zinc-200 pl-5">
            <span className="font-title text-[26px] leading-none text-zinc-900">{streak ?? '…'}</span>
            <span className="text-xs text-zinc-500">连续天数</span>
          </div>
        </div>
      </section>

      {/* 查单词 */}
      <section className="pointer-events-auto mt-4 rounded-3xl border border-white/50 bg-card/70 p-5 shadow-xl shadow-black/10 backdrop-blur-xl">
        <label htmlFor="home-lookup" className="block text-[13px] font-medium tracking-[0.08em] text-zinc-500">
          查单词
        </label>
        <div className="mt-2.5 flex h-[50px] items-center rounded-[10px] border border-zinc-300 pl-3.5 transition-colors focus-within:border-zinc-900">
          <input
            id="home-lookup"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setMsg('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && submitSearch()}
            placeholder="输入英文或中文，如 apple / 苹果"
            className="min-w-0 flex-1 bg-transparent font-title text-[16px] outline-none"
          />
          <button
            data-ripple-wave="1"
            onClick={submitSearch}
            disabled={busy || !query.trim()}
            className="h-[30px] shrink-0 border-l border-zinc-200 px-3.5 text-[13px] font-medium tracking-[0.04em] text-zinc-900 disabled:opacity-40"
          >
            {busy ? '查询中' : '搜索'}
          </button>
        </div>
        {msg && <p className="mt-2 text-xs text-emerald-600">{msg}</p>}

        {result && (
          <div className="mt-3 rounded-xl border border-zinc-200 bg-card p-3">
            {result.found && result.data ? (
              <>
                {result.kind === 'cn' && (result.candidates?.length ?? 0) > 1 && (
                  <div className="mb-3">
                    <div className="mb-1 text-xs text-zinc-400">「{query.trim()}」的候选英文词（点击切换）</div>
                    <div className="space-y-1.5">
                      {(result.candidates ?? []).map((c) => (
                        <button
                          key={c.w + (c.m ?? '')}
                          onClick={async () => {
                            const d = await resolveCandidate(c.w)
                            setResult({ ...result, word: c.w, data: d })
                          }}
                          className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                            result.word === c.w ? 'bg-emerald-100 ring-1 ring-emerald-400' : 'bg-card'
                          }`}
                        >
                          <span className={`font-semibold ${result.word === c.w ? 'text-emerald-600' : 'text-zinc-800'}`}>{c.w}</span>
                          {c.m && <span className="truncate text-xs text-zinc-400">{c.m}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <DictEntryView data={result.data} />
                <div className="mt-3">
                  <div className="mb-1 text-xs text-zinc-400">想背它？收藏到</div>
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
                <div className="mt-3 flex gap-2">
                  <button onClick={addToBook} className="flex-1 rounded-lg bg-inverse py-2 text-sm font-medium text-inverse-ink">
                    添加进单词书
                  </button>
                  <button onClick={() => setResult(null)} className="rounded-lg bg-zinc-200 px-4 text-sm text-zinc-500">
                    关闭
                  </button>
                </div>
              </>
            ) : result.kind === 'cn' ? (
              <>
                {(result.sentHits?.length ?? 0) > 0 && (
                  <div className="rounded-xl bg-sky-50 px-4 py-3">
                    <div className="text-xs font-medium text-sky-500">整句翻译（来自例句库）</div>
                    <div className="mt-2 space-y-2">
                      {(result.sentHits ?? []).map((h, i) => (
                        <p key={i} className="flex items-center gap-2 text-sm">
                          <span className="text-zinc-500">{h.zh}</span>
                          <span className="text-zinc-300">→</span>
                          <span className="font-medium text-zinc-800">{h.en}</span>
                          <SpeakButton word={h.en} size="sm" />
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                {result.online && (
                  <div className={`${(result.sentHits?.length ?? 0) > 0 ? 'mt-3 ' : ''}rounded-xl bg-emerald-50 px-4 py-3`}>
                    <div className="text-xs font-medium text-emerald-600">翻译结果（在线翻译 · 已缓存可离线查看）</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-base font-medium text-zinc-800">{result.online}</span>
                      <SpeakButton word={result.online} size="sm" />
                    </div>
                  </div>
                )}
                {!result.sentHits?.length && !result.online && (
                  <div className="py-6 text-center">
                    <p className="text-4xl">🔍</p>
                    <p className="mt-3 text-sm text-zinc-500">词库里没有与「{query.trim()}」匹配的释义</p>
                    <p className="mt-1 text-xs text-zinc-400">
                      {navigator.onLine ? '换个说法试试，或直接搜它的英文' : '当前离线，联网后再试可启用在线翻译'}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                {result.online && (
                  <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-3">
                    <div className="text-xs font-medium text-emerald-600">翻译结果（在线翻译 · 已缓存可离线查看）</div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-base font-medium text-zinc-800">{result.online}</span>
                      <button
                        onClick={() => speakZh(result.online!)}
                        title="朗读"
                        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700 active:bg-emerald-200"
                      >
                        🔊
                      </button>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{result.word || query.trim()}</span>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-500">词库未收录，请手填</span>
                </div>
                <textarea
                  value={result.manualText}
                  onChange={(e) => setResult({ ...result, manualText: e.target.value })}
                  rows={3}
                  placeholder={'每行一条，格式：n. 释义1；释义2'}
                  className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
                />
                <div className="mt-2">
                  <div className="mb-1 text-xs text-zinc-400">收藏到</div>
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
                <div className="mt-3 flex gap-2">
                  <button onClick={addManual} className="flex-1 rounded-lg bg-inverse py-2 text-sm font-medium text-inverse-ink">
                    添加进单词书
                  </button>
                  <button onClick={() => setResult(null)} className="rounded-lg bg-zinc-200 px-4 text-sm text-zinc-500">
                    取消
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* 当前词书 */}
      <section className="pointer-events-auto mt-4 rounded-3xl border border-white/50 bg-card/70 px-5 shadow-xl shadow-black/10 backdrop-blur-xl">
        <div className="flex min-h-[56px] items-center justify-between">
          <span className="text-sm text-zinc-900">当前词书</span>
          {book ? (
            <span className="text-sm font-medium text-zinc-900">{book.name}</span>
          ) : (
            <button onClick={onGoBooks} className="flex items-center gap-1.5 text-sm text-zinc-500">
              去选择词书
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        {book && counts && (
          <div className="pb-4">
            <div className="flex items-center justify-between text-[13px] text-zinc-500">
              <span>
                已通关 <span className="font-semibold text-emerald-600">{counts.passed}</span> / {counts.total} 词
              </span>
              {counts.learning > 0 && <span className="text-amber-500">学习中 {counts.learning}</span>}
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-200">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.min(100, (counts.passed / Math.max(1, counts.total)) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* 主操作：反色实心（浅色黑底白字 / 深色白底黑字） */}
      <button
        data-ripple-wave="1"
        onClick={() => (book ? onStart(!hasTask) : onGoBooks())}
        className="pointer-events-auto mt-6 w-full rounded-2xl bg-inverse py-4 text-[15px] font-medium tracking-[0.06em] text-inverse-ink shadow-lg shadow-black/20 transition-opacity active:opacity-85"
      >
        {label}
      </button>

      {book && !hasTask && (
        <p className="mt-4 text-center text-xs text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
          今日额度已完成，加背不计入计划进度
        </p>
      )}

      {/* 四遍通关：内容本身有先后，所以用带刻度的四步轨道 */}
      <section className="pointer-events-auto mt-4 mb-2 rounded-3xl border border-white/50 bg-card/70 p-5 shadow-xl shadow-black/10 backdrop-blur-xl">
        <h2 className="text-[13px] font-medium tracking-[0.08em] text-zinc-500">四遍通关</h2>
        <ol className="mt-4 grid grid-cols-4">
          {PASSES.map((p) => (
            <li key={p.n} className="relative border-t border-zinc-200 pr-1.5 pt-4">
              <span className="absolute -top-[2.5px] left-0 h-[5px] w-[5px] rounded-full bg-zinc-300" />
              <span className="block font-title text-[15px] leading-none text-zinc-900">{p.n}</span>
              <span className="mt-1.5 block text-xs leading-snug text-zinc-500">{p.t}</span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs leading-[1.75] text-zinc-500">
          第二、三遍答错的词会当场重现，全对才算真正通关；通关后按错误率安排复习。
        </p>
      </section>
    </div>
  )
}
