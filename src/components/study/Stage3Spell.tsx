import { useMemo, useState } from 'react'
import type { SessionItem } from '../../study'
import { recordAnswer, sensesOf } from '../../study'
import { normalizeEn } from '../../match'
import { speakWord } from '../speech'
import { SpeakButton } from '../SpeakButton'
import { Card } from './parts'

/** 第3遍 · 看义默写：显示全部中文释义，默写英文单词；答错上报重考 */
export default function Stage3Spell({
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
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')
  const [revealed, setRevealed] = useState(false)

  async function submit() {
    if (!input.trim() || revealed) return
    if (normalizeEn(input) === normalizeEn(w.name)) {
      await recordAnswer(item, true)
      onDone()
    } else {
      await recordAnswer(item, false)
      onError()
      setErr(`正确拼写：${w.name}`)
      setRevealed(true)
      speakWord(w.name)
    }
  }

  /** 不会？直接看答案：记为未背出，这个词稍后会重现 */
  async function giveUp() {
    await recordAnswer(item, false)
    onError()
    setErr(`正确拼写：${w.name}`)
    setRevealed(true)
    speakWord(w.name)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card item={item} top={<SpeakButton word={w.name} size="sm" />}>
        <div className="space-y-2 text-left">
          {senses.map((s, i) => (
            <p key={i} className="rounded-lg bg-zinc-50 px-4 py-2">
              <span className="mr-2 text-xs font-medium text-emerald-600">{s.pos}</span>
              <span className="text-zinc-700">{s.zh.join('；')}</span>
            </p>
          ))}
        </div>

        <div className="mt-6">
          {revealed ? (
            <div>
              <p className="text-3xl font-bold text-emerald-600">{w.name}</p>
              <p className="mt-1 text-sm text-red-400">再默写一遍加深记忆</p>
            </div>
          ) : (
            <input
              autoFocus
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setErr('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              placeholder="默写英文单词"
              className={`w-full rounded-lg border px-4 py-3 text-center text-xl focus:outline-none ${
                err ? 'border-red-300' : 'border-zinc-200 focus:border-emerald-400'
              }`}
            />
          )}
          {err && !revealed && <p className="mt-2 text-sm text-red-500">{err}</p>}
        </div>
      </Card>

      {revealed ? (
        <button
          onClick={() => onDone()}
          className="rounded-2xl bg-inverse py-4 font-semibold text-inverse-ink active:bg-inverse/85"
        >
          我记住了，继续 ↷
        </button>
      ) : (
        <div className="flex gap-3">
          <button
            onClick={submit}
            className="flex-1 rounded-2xl bg-brand py-4 font-semibold text-white active:bg-brand-press"
          >
            检查
          </button>
          <button
            onClick={giveUp}
            className="rounded-2xl bg-zinc-200 px-5 py-4 text-sm font-medium text-zinc-600 active:bg-zinc-300"
          >
            不会？看答案
          </button>
        </div>
      )}
    </div>
  )
}
