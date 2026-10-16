import { useEffect, useMemo, useRef, useState } from 'react'
import { getBook } from '../../books'
import { getSettings } from '../../db'
import { buildNotebookSession, buildSession, completeStage, STAGES, type SessionItem, type SessionPlan } from '../../study'
import Stage1Memorize from './Stage1Memorize'
import Stage2Fill from './Stage2Fill'
import Stage3Spell from './Stage3Spell'
import Stage4Sentence from './Stage4Sentence'
import Scratchpad from './Scratchpad'
import LookupSheet from './LookupSheet'
import { clearSession, loadSession, normalSessionKey, notebookSessionKey, saveSession } from '../../session'

export type StudySpec =
  | { kind: 'normal'; extra: boolean }
  | { kind: 'notebook'; wordBookId?: string; selectedIds?: string[] }

type Phase = 'loading' | 'empty' | 'round' | 'done' | 'error'

/** 第一个有词可学的轮次；没有返回 0 */
function firstRoundWithItems(plan: SessionPlan): number {
  for (let r = 1; r <= 4; r++) {
    if (plan.items.some((it) => it.startStage < r)) return r
  }
  return 0
}

function nextRoundWithItems(plan: SessionPlan, from: number): number {
  for (let r = from + 1; r <= 4; r++) {
    if (plan.items.some((it) => it.startStage < r)) return r
  }
  return 0
}

export default function StudyFlow({ spec, onExit }: { spec: StudySpec; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [plan, setPlan] = useState<SessionPlan | null>(null)
  const [round, setRound] = useState(1)
  // 当前轮的可变队列：错词会插队重现
  const [queue, setQueue] = useState<SessionItem[]>([])
  const [idx, setIdx] = useState(0)
  const [intro, setIntro] = useState(true)
  const [errMsg, setErrMsg] = useState('')
  const [padOpen, setPadOpen] = useState(false)
  const [lookupOpen, setLookupOpen] = useState(false)
  /** 本次会话的词书（查词收藏时判断词条归属用；记词本复习/自定义词为 null） */
  const [sessionBookId, setSessionBookId] = useState<string | null>(null)
  /** 会话存档的 key（按书/按勾选词区分），存到 ref 里给存档 effect 用 */
  const specKeyRef = useRef<string | null>(null)
  // 当前这个词的出现是否答错过（答错过就不消待重现副本）
  const erroredRef = useRef(false)
  // 本轮内每个词连续答对的次数：连对两次就不再重现（频率别太高）
  const correctRunRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    erroredRef.current = false
  }, [idx, round])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 先看有没有上次没背完的存档（同一本书/同一批勾选词）：有就原样接着背，
        // 从第几轮、第几词、错词副本全都还原 —— 只有四遍全部完成才会清档从头开始
        const key =
          spec.kind === 'notebook'
            ? notebookSessionKey(spec.wordBookId, spec.selectedIds)
            : normalSessionKey((await getSettings()).currentBookId)
        specKeyRef.current = key
        const saved = await loadSession(key)
        if (!alive) return
        if (saved && saved.queue.length > 0) {
          setPlan(saved.plan)
          setRound(saved.round)
          setQueue(saved.queue)
          setIdx(Math.min(saved.idx, saved.queue.length - 1))
          setIntro(saved.intro)
          setPhase('round')
          if (spec.kind === 'normal') {
            const s = await getSettings()
            setSessionBookId(s.currentBookId)
          }
          return
        }
        const result =
          spec.kind === 'notebook'
            ? await buildNotebookSession(spec.wordBookId, spec.selectedIds)
            : await (async () => {
                const s = await getSettings()
                const book = getBook(s.currentBookId)
                if (!book) throw new Error('请先选择词书')
                setSessionBookId(book.id)
                return buildSession(book, spec.extra)
              })()
        if (!alive) return
        setPlan(result)
        // 跳过没有可学词的轮次（断点续学时第1遍可能已完成）
        const first = firstRoundWithItems(result)
        if (!first || result.items.length === 0) {
          setPhase('empty')
        } else {
          setRound(first)
          setQueue(result.items.filter((it) => it.startStage < first))
          setPhase('round')
        }
      } catch (e) {
        if (alive) {
          setErrMsg(e instanceof Error ? e.message : String(e))
          setPhase('error')
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [spec])

  // 进度一变就存档：退出/切页/刷新后回来还能原样接着
  useEffect(() => {
    if (phase !== 'round' || !plan || !specKeyRef.current || queue.length === 0) return
    void saveSession(specKeyRef.current, {
      spec: { ...spec },
      plan,
      round,
      queue,
      idx,
      intro,
      savedAt: Date.now(),
    })
  }, [phase, plan, round, queue, idx, intro, spec])

  // 四遍全部完成才清档：下次进来从头开始新一批词
  useEffect(() => {
    if (phase === 'done' && specKeyRef.current) void clearSession(specKeyRef.current)
  }, [phase])

  const current: SessionItem | undefined = queue[idx]

  function goToRound(r: number) {
    setRound(r)
    setQueue(plan ? plan.items.filter((it) => it.startStage < r) : [])
    setIdx(0)
    setIntro(true)
    correctRunRef.current = new Map() // 新一轮重新数连对
  }

  async function handleStageDone() {
    if (!current) return
    await completeStage(current, round)
    const key = `${current.bookId}:${current.word.name}`
    const run = (correctRunRef.current.get(key) ?? 0) + 1
    correctRunRef.current.set(key, run)
    let nq = queue
    if ((round === 2 || round === 3) && run >= 2) {
      // 连对两次：把这个词还在排队的副本全部清掉，不再出现
      nq = queue.filter((it, j) => j <= idx || `${it.bookId}:${it.word.name}` !== key)
    } else if ((round === 2 || round === 3) && !erroredRef.current && Math.random() < 0.3) {
      // 频率不高：只有三成概率随机撒回一次（第1/4遍从不重现）
      const at = idx + 1 + Math.floor(Math.random() * Math.max(1, queue.length - idx))
      nq = [...queue]
      nq.splice(Math.min(at, nq.length), 0, { ...current })
    }
    if (idx + 1 < nq.length) {
      setQueue(nq)
      setIdx(idx + 1)
      return
    }
    setQueue(nq)
    const next = plan ? nextRoundWithItems(plan, round) : 0
    if (next) {
      goToRound(next)
    } else {
      setPhase('done')
    }
  }

  /** 第2/3遍答错：这个词的两个副本**随机**撒进队列剩下的部分，全程都可能再冒出来 */
  function handleError() {
    erroredRef.current = true
    if (!current) return
    const key = `${current.bookId}:${current.word.name}`
    correctRunRef.current.set(key, 0) // 答错把连对清零
    setQueue((q) => {
      let copy = [...q]
      // 先删掉这个词所有还在排队的旧副本（同一词多次答错不叠加）
      for (let i = copy.length - 1; i > idx; i--) {
        if (`${copy[i].bookId}:${copy[i].word.name}` === key) copy.splice(i, 1)
      }
      // 再随机插两个
      for (let n = 0; n < 2; n++) {
        const at = idx + 1 + Math.floor(Math.random() * Math.max(1, copy.length - idx))
        copy.splice(Math.min(at, copy.length), 0, { ...current })
      }
      return copy
    })
  }

  if (phase === 'loading') return <p className="mt-20 text-center text-zinc-400">正在准备…</p>

  if (phase === 'error')
    return (
      <div className="mt-20 flex flex-col items-center gap-4">
        <p className="text-zinc-500">{errMsg}</p>
        <button onClick={onExit} className="text-emerald-600 underline">
          回首页
        </button>
      </div>
    )

  if (phase === 'empty')
    return (
      <div className="mt-20 flex flex-col items-center gap-4 text-center">
        <div className="text-6xl">🌿</div>
        <p className="text-lg font-semibold">今天没有需要学习的内容</p>
        <p className="text-sm text-zinc-500">
          {spec.kind === 'notebook' ? '这本单词书里还没有收藏的词，学习时点 ✓ 收藏吧' : '新词学完了，复习也做完了，休息一下明天再来'}
        </p>
        <button onClick={onExit} className="rounded-2xl bg-brand px-10 py-3 font-semibold text-white active:bg-brand-press">
          回首页
        </button>
      </div>
    )

  if (phase === 'done') {
    const passedCount = (plan?.newCount ?? 0) + (plan?.resumeCount ?? 0)
    return (
      <div className="mt-20 flex flex-col items-center gap-4 text-center">
        <div className="text-6xl">🎉</div>
        <p className="text-xl font-semibold">四遍全部完成！</p>
        <p className="text-sm text-zinc-500">
          通关 {passedCount} 词 · 复习 {plan?.reviewCount ?? 0} 词
          <br />
          错误多的词明天会优先出现
        </p>
        <button onClick={onExit} className="rounded-2xl bg-brand px-10 py-3 font-semibold text-white active:bg-brand-press">
          回首页
        </button>
      </div>
    )
  }

  const stage = STAGES[round - 1]

  const stageEl = current ? (
    round === 1 ? (
      <Stage1Memorize key={`1-${current.bookId}-${current.word.name}-${idx}`} item={current} onDone={handleStageDone} />
    ) : round === 2 ? (
      <Stage2Fill key={`2-${current.bookId}-${current.word.name}-${idx}`} item={current} onDone={handleStageDone} onError={handleError} />
    ) : round === 3 ? (
      <Stage3Spell key={`3-${current.bookId}-${current.word.name}-${idx}`} item={current} onDone={handleStageDone} onError={handleError} />
    ) : (
      <Stage4Sentence key={`4-${current.bookId}-${current.word.name}-${idx}`} item={current} onDone={handleStageDone} />
    )
  ) : null

  return (
    <div className="flex flex-col gap-4">
      {/* pr-12 给右上角的树枝音乐开关让位 */}
      <div className="flex items-center justify-between pr-16 text-sm">
        <span className="font-medium text-emerald-600">{stage.title}</span>
        <button onClick={onExit} className="text-zinc-400 underline">
          退出
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${((round - 1) / 4) * 100 + ((idx / Math.max(1, queue.length)) * 100) / 4}%` }}
        />
      </div>

      {intro ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <div className="text-5xl">{['👁', '✍️', '🔤', '📖'][round - 1]}</div>
          <p className="text-xl font-bold">{stage.title}</p>
          <p className="text-sm text-zinc-500">{stage.hint}</p>
          <p className="text-xs text-zinc-400">
            {round === 2 || round === 3
              ? `本轮共 ${queue.length} 词 · 答错的词随机重现，一个词连对两次就不再出现`
              : `本轮共 ${queue.length} 词 · 顺一遍就过，不重复出现`}
          </p>
          <button
            onClick={() => setIntro(false)}
            className="mt-4 rounded-2xl bg-brand px-12 py-3.5 font-semibold text-white active:bg-brand-press"
          >
            开始
          </button>
        </div>
      ) : (
        current && (
          <>
            <div className="text-center text-xs text-zinc-400">
              {idx + 1} / {queue.length}
            </div>
            {stageEl}
          </>
        )
      )}

      {/* 悬浮工具：查词 + 草稿板。背单词途中随时查词、看讲解、收藏 */}
      <div className="fixed bottom-24 right-4 z-40 flex flex-col gap-2">
        <button
          onClick={() => setLookupOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-inverse/90 text-xl text-inverse-ink shadow-lg active:bg-inverse/85"
          title="查词"
        >
          🔍
        </button>
        <button
          onClick={() => setPadOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-inverse/90 text-xl text-inverse-ink shadow-lg active:bg-inverse/85"
          title="草稿板"
        >
          ✏️
        </button>
      </div>
      {padOpen && <Scratchpad onClose={() => setPadOpen(false)} />}
      {lookupOpen && <LookupSheet studyBookId={sessionBookId} onClose={() => setLookupOpen(false)} />}
    </div>
  )
}
