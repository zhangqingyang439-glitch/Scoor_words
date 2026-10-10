import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import type { SessionItem } from '../../study'
import { sensesOf } from '../../study'
import { db, createWordBook, setCollect, DEFAULT_WORD_BOOK, listWordBooks, type WordBookRow } from '../../db'
import { prefetchWordAudio } from '../speech'
import { SpeakButton } from '../SpeakButton'
import { useSentenceData } from '../useSentenceData'

/** 对勾收藏按钮：圆圈 + 动态打勾动画 */
export function CollectCheck({ collected }: { collected: boolean }) {
  return (
    <span
      key={collected ? 'on' : 'off'}
      className={`collect-pop inline-flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
        collected ? 'border-emerald-500 bg-brand' : 'border-zinc-500 bg-zinc-100'
      }`}
    >
      {collected && (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 12.5l5 5 10-11" />
        </svg>
      )}
    </span>
  )
}

/** 选书弹层：把当前词收藏进某本单词书（可勾选“记住选择”） */
function BookPicker({
  books,
  current,
  remember,
  onRemember,
  onPick,
  onClose,
}: {
  books: WordBookRow[]
  current: string | null
  remember: boolean
  onRemember: (v: boolean) => void
  onPick: (id: string, save?: boolean) => void
  onClose: () => void
}) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  async function create() {
    const name = newName.trim()
    if (!name) return
    const row = await createWordBook(name)
    setNewName('')
    setCreating(false)
    onPick(row.id, remember)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="max-h-[75vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 text-center text-sm font-medium text-zinc-500">收藏到哪本单词书？</div>
        <div className="flex flex-col gap-2">
          {books.map((b) => (
            <button
              key={b.id}
              onClick={() => onPick(b.id, remember)}
              className={`flex items-center justify-between rounded-xl px-4 py-3 text-left ${
                b.id === current ? 'bg-emerald-50 ring-1 ring-emerald-400' : 'bg-zinc-50'
              }`}
            >
              <span className="font-medium">{b.name}</span>
              {b.id === DEFAULT_WORD_BOOK && <span className="text-xs text-zinc-400">默认</span>}
            </button>
          ))}
          {books.length === 0 && <p className="py-4 text-center text-sm text-zinc-400">还没有单词书</p>}
        </div>
        {creating ? (
          <div className="mt-3 flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              placeholder="新书名，如：雅思核心"
              className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
            />
            <button onClick={create} className="rounded-lg bg-brand px-4 text-sm font-medium text-white">
              创建并选它
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="mt-3 w-full rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm text-zinc-500"
          >
            ＋ 新建单词书
          </button>
        )}
        <label className="mt-3 flex items-center justify-center gap-2 text-sm text-zinc-500">
          <input type="checkbox" checked={remember} onChange={(e) => onRemember(e.target.checked)} className="h-4 w-4 accent-emerald-500" />
          记住选择，以后点 ✓ 直接收藏进这本书
        </label>
        <button onClick={onClose} className="mt-3 w-full rounded-xl bg-zinc-100 py-2.5 text-sm text-zinc-500">
          取消
        </button>
      </div>
    </div>
  )
}

/** 学习卡片容器：kind 标签 + 对勾收藏（设了默认书直接收，否则弹层选）+ 内容 */
export function Card({
  item,
  top,
  children,
}: {
  item: SessionItem
  top?: ReactNode
  children: ReactNode
}) {
  const [collectedIn, setCollectedIn] = useState<string | null>(item.progress?.collectedIn ?? null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [remember, setRemember] = useState(true)
  const books = useLiveQuery(() => listWordBooks(), [])
  const settingsRow = useLiveQuery(
    async () => (await db.settings.get('app'))?.value as { collectBookId?: string } | undefined,
    [],
  )

  // 换词时重置收藏状态，并预加载该词真人发音（点击秒播 + 自动缓存离线可用）
  useEffect(() => {
    setCollectedIn(item.progress?.collectedIn ?? null)
    setPickerOpen(false)
    prefetchWordAudio(item.word.name)
  }, [item])

  async function pick(id: string, save?: boolean) {
    setCollectedIn(id)
    setPickerOpen(false)
    await setCollect(item.bookId, item.word.name, item.order, id)
    if (save) {
      const cur = await db.settings.get('app')
      const value = { ...((cur?.value as Record<string, unknown>) ?? {}), collectBookId: id }
      await db.settings.put({ key: 'app', value })
    }
  }

  async function tapCollect() {
    if (collectedIn) {
      setCollectedIn(null)
      await setCollect(item.bookId, item.word.name, item.order, null)
      return
    }
    const remembered = settingsRow?.collectBookId
    if (remembered && (books ?? []).some((b) => b.id === remembered)) {
      await pick(remembered)
    } else {
      setPickerOpen(true)
    }
  }

  return (
    <div className="rounded-3xl bg-card p-6 shadow-sm">
      <div className="flex min-h-12 items-center justify-between gap-2">
        <span className="text-xs text-zinc-400">
          {item.kind === 'new' ? '新词' : item.kind === 'review' ? '复习' : '继续学习'}
        </span>
        {top}
        <button onClick={tapCollect} title="收藏到单词书">
          <CollectCheck collected={!!collectedIn} />
        </button>
      </div>
      <div className="mt-3 text-center">{children}</div>
      {pickerOpen && (
        <BookPicker
          books={books ?? []}
          current={collectedIn}
          remember={remember}
          onRemember={setRemember}
          onPick={pick}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

export function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const pct = seconds / total
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold"
      style={{ background: `conic-gradient(#10b981 ${pct * 360}deg, var(--ring-track) 0deg)` }}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-card">{seconds}</span>
    </div>
  )
}

/**
 * 第2/3遍作答后的回看卡：把第1遍的背诵内容（单词 + 释义 + 速记法）再摆出来，
 * 无论对错都看一遍再切下一个词 —— 答完直接切词，记忆是断的。
 *
 * ok=false 时顶部给出正确答案行（第2遍是释义，第3遍是拼写，由调用方传入）。
 */
export function RecapCard({
  item,
  ok,
  answer,
  onContinue,
}: {
  item: SessionItem
  ok: boolean
  /** 答错时展示的正确答案；不传只标对错 */
  answer?: string
  onContinue: () => void
}) {
  const w = item.word
  const senses = sensesOf(w)
  const data = useSentenceData()
  const mnem = data.m[w.name.toLowerCase()]

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl bg-card p-6 shadow-sm">
        <div className="flex min-h-8 items-center justify-between">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
            }`}
          >
            {ok ? '✓ 答对了' : '✗ 没答对，重现时再来一次'}
          </span>
          <SpeakButton word={w.name} size="sm" />
        </div>

        <div className="mt-2 text-center">
          <div className="text-4xl font-bold tracking-wide">{w.name}</div>
          {w.usphone && <div className="mt-1 text-sm text-zinc-400">/{w.usphone}/</div>}
        </div>

        {!ok && answer && (
          <div className="mt-3 rounded-lg bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-500">
            {answer}
          </div>
        )}

        <div className="mt-4 space-y-2 text-left">
          {senses.map((s, i) => (
            <p key={i} className="rounded-lg bg-zinc-50 px-4 py-2">
              <span className="mr-2 text-xs font-medium text-emerald-600">{s.pos}</span>
              <span className="text-zinc-700">{s.zh.join('；')}</span>
            </p>
          ))}
        </div>

        {mnem && (
          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-left">
            <div className="text-xs font-medium text-amber-500">🧠 速记法</div>
            <div className="mt-1 text-sm leading-relaxed text-zinc-600">{mnem}</div>
          </div>
        )}
      </div>
      <button onClick={onContinue} className="rounded-2xl bg-brand py-4 font-semibold text-white active:bg-brand-press">
        记好了，继续 ↷
      </button>
    </div>
  )
}
