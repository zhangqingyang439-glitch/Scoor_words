import { useMemo, useState } from 'react'
import type { SessionItem } from '../../study'
import { recordAnswer, sensesOf } from '../../study'
import { matchMeaning } from '../../match'
import { SpeakButton } from '../SpeakButton'
import { Card } from './parts'

/** 第2遍 · 看词填义：按词性出空，每个词性写对一个中文意思即过；答错上报重考 */
export default function Stage2Fill({
  item,
  onDone,
  onError,
}: {
  item: SessionItem
  onDone: () => void
  onError: () => void
}) {
  const w = item.word
  const senses = useMemo(() => sensesOf(w), [w])
  // 每组词性一个空：'pending' | 'ok' | 'revealed'
  const [state, setState] = useState<Record<number, 'pending' | 'ok' | 'revealed'>>({})
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')
  const [gaveUp, setGaveUp] = useState(false)
  const currentIdx = senses.findIndex((_, i) => (state[i] ?? 'pending') === 'pending')
  const current = currentIdx >= 0 ? senses[currentIdx] : null

  async function submit() {
    if (!current || !input.trim()) return
    if (matchMeaning(input, current.zh)) {
      await recordAnswer(item, true)
      const next = { ...state, [currentIdx]: 'ok' as const }
      setState(next)
      setInput('')
      setErr('')
      if (senses.every((_, i) => next[i] === 'ok' || next[i] === 'revealed')) {
        onDone()
      }
    } else {
      await recordAnswer(item, false)
      onError()
      setErr(`正确答案：${current.zh.join('；')}`)
    }
  }

  function revealAndContinue() {
    // 提示正确答案后，选择“记住了”直接过这一空
    if (currentIdx >= 0) {
      const next = { ...state, [currentIdx]: 'revealed' as const }
      setState(next)
      if (senses.every((_, i) => next[i] === 'ok' || next[i] === 'revealed')) {
        onDone()
        return
      }
    }
    setInput('')
    setErr('')
  }

  /** 不会？直接看答案：记为未背出，这个词稍后会重现 */
  async function giveUp() {
    if (gaveUp) return
    setGaveUp(true)
    await recordAnswer(item, false)
    onError()
    const next: Record<number, 'ok' | 'revealed' | 'pending'> = {}
    senses.forEach((_, i) => (next[i] = 'revealed'))
    setState(next)
    setInput('')
    setErr('')
  }

  async function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') await submit()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card item={item}>
        <div className="text-4xl font-bold tracking-wide">{w.name}</div>
        <div className="mt-2 flex items-center justify-center gap-2 text-zinc-400">
          {w.usphone && <span>/{w.usphone}/</span>}
          <SpeakButton word={w.name} size="sm" />
        </div>

        <div className="mt-6 space-y-3 text-left">
          {senses.map((s, i) => {
            const st = state[i] ?? 'pending'
            const isCurrent = i === currentIdx
            return (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      st === 'pending' ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-400'
                    }`}
                  >
                    {s.pos}
                  </span>
                  {st === 'pending' ? (
                    isCurrent ? (
                      <input
                        autoFocus
                        value={input}
                        onChange={(e) => {
                          setInput(e.target.value)
                          setErr('')
                        }}
                        onKeyDown={handleKey}
                        placeholder="写一个中文意思"
                        className="w-full rounded-lg border border-zinc-200 px-3 py-2 focus:border-emerald-400 focus:outline-none"
                      />
                    ) : (
                      <div className="h-10 w-full animate-pulse rounded-lg bg-zinc-50" />
                    )
                  ) : (
                    <span className="text-sm text-zinc-500">{s.zh.join('；')}</span>
                  )}
                </div>
                {isCurrent && err && (
                  <p className="mt-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500">{err}</p>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {gaveUp ? (
        <button
          onClick={onDone}
          className="rounded-2xl bg-inverse py-4 font-semibold text-inverse-ink active:bg-inverse/85"
        >
          知道了，继续 ↷
        </button>
      ) : current ? (
        <div className="flex gap-3">
          <button
            onClick={submit}
            className="flex-1 rounded-2xl bg-brand py-4 font-semibold text-white active:bg-brand-press"
          >
            检查
          </button>
          {err ? (
            <button
              onClick={revealAndContinue}
              className="rounded-2xl bg-zinc-200 px-5 py-4 font-medium text-zinc-600 active:bg-zinc-300"
            >
              记住了
            </button>
          ) : (
            <button
              onClick={giveUp}
              className="rounded-2xl bg-zinc-200 px-5 py-4 text-sm font-medium text-zinc-600 active:bg-zinc-300"
            >
              不会？看答案
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
