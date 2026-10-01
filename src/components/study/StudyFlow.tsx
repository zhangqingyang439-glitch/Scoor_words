import { useEffect, useMemo, useRef, useState } from 'react'
import { getBook } from '../../books'
import { getSettings } from '../../db'
import { buildNotebookSession, buildSession, completeStage, STAGES, type SessionItem, type SessionPlan } from '../../study'
import Stage1Memorize from './Stage1Memorize'
import Stage2Fill from './Stage2Fill'
import Stage3Spell from './Stage3Spell'
import Stage4Sentence from './Stage4Sentence'
import Scratchpad from './Scratchpad'

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
  // 当前这个词的出现是否答错过（答错过就不消待重现副本）
  const erroredRef = useRef(false)

  useEffect(() => {
    erroredRef.current = false
  }, [idx, round])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const result =
          spec.kind === 'notebook'
            ? await buildNotebookSession(spec.wordBookId, spec.selectedIds)
            : await (async () => {
                const s = await getSettings()
                const book = getBook(s.currentBookId)
                if (!book) throw new Error('请先选择词书')
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

  const current: SessionItem | undefined = queue[idx]

  function goToRound(r: number) {
    setRound(r)
    setQueue(plan ? plan.items.filter((it) => it.startStage < r) : [])
    setIdx(0)
    setIntro(true)
  }

  async function handleStageDone() {
    if (!current) return
    await completeStage(current, round)
    const key = `${current.bookId}:${current.word.name}`
    // 这次出现无错 → 消掉一个待重现副本；答错过则保持 2 个不动。
    // 先算出新队列再决定 idx/换轮，避免用旧长度判断导致越界空页
    let nq = queue
    if (!erroredRef.current) {
      const i = queue.findIndex((it, j) => j > idx && `${it.bookId}:${it.word.name}` === key)
      if (i >= 0) {
        nq = [...queue]
        nq.splice(i, 1)
      }
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

  /** 第2/3遍答错：保持该词始终有 2 个待重现副本，且间隔摆放不连在一起 */
  function handleError() {
    erroredRef.current = true
    if (!current) return
    const key = `${current.bookId}:${current.word.name}`
    setQueue((q) => {
      let copy = [...q]
      // 先删掉这个词所有还在排队的旧副本（避免越积越多）
      for (let i = copy.length - 1; i > idx; i--) {
        if (`${copy[i].bookId}:${copy[i].word.name}` === key) copy.splice(i, 1)
      }
      // 再重新插两个，位置隔开
      const at1 = Math.min(idx + 3, copy.length)
      copy.splice(at1, 0, { ...current })
      const at2 = Math.min(at1 + 5, copy.length)
      copy.splice(at2, 0, { ...current })
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
          <p className="text-xs text-zinc-400">本轮共 {queue.length} 词 · 填义/默写答错的词会马上重现</p>
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

      {/* 草稿板入口 */}
      <button
        onClick={() => setPadOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-inverse/90 text-xl text-inverse-ink shadow-lg active:bg-inverse/85"
        title="草稿板"
      >
        ✏️
      </button>
      {padOpen && <Scratchpad onClose={() => setPadOpen(false)} />}
    </div>
  )
}
