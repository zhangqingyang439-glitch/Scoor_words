import { useMemo, useState } from 'react'
import type { SessionItem } from '../../study'
import { recordAnswer, sensesOf } from '../../study'
import { normalizeEn } from '../../match'
import { speakWord } from '../speech'
import { SpeakButton } from '../SpeakButton'
import { DictCard } from '../DictCard'
import { Card, RecapCard } from './parts'

/**
 * 第3遍 · 看义默写：显示全部中文释义，默写英文单词。
 * 答错只标红提示「不对」，不显示答案，可以改了再检查；答对或「看答案」才进回看卡。
 * 答错上报重考。
 */
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
  const [wrong, setWrong] = useState(false)
  const [recap, setRecap] = useState<{ ok: boolean } | null>(null)
  const [dictWord, setDictWord] = useState<string | null>(null)

  async function submit() {
    if (!input.trim() || recap) return
    if (normalizeEn(input) === normalizeEn(w.name)) {
      await recordAnswer(item, true)
      setWrong(false)
      setRecap({ ok: true })
    } else {
      await recordAnswer(item, false)
      onError()
      setWrong(true)
    }
  }

  /** 不会？直接看答案：进回看卡（里面亮出拼写），稍后重现 */
  async function giveUp() {
    if (recap) return
    await recordAnswer(item, false)
    onError()
    speakWord(w.name)
    setRecap({ ok: false })
  }

  if (recap) {
    return (
      <div className="flex flex-col gap-4">
        <RecapCard
          item={item}
          ok={recap.ok}
          answer={recap.ok ? undefined : `正确拼写：${w.name}`}
          onContinue={onDone}
        />
        {dictWord && <DictCard word={dictWord} onClose={() => setDictWord(null)} />}
      </div>
    )
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
          <input
            autoFocus
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              if (wrong) setWrong(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="默写英文单词"
            className={`w-full rounded-lg border px-4 py-3 text-center text-xl focus:outline-none ${
              wrong ? 'border-red-300 focus:border-red-400' : 'border-zinc-200 focus:border-emerald-400'
            }`}
          />
          {wrong && (
            <p className="mt-2 text-center text-xs text-red-400">✗ 拼写不对，再想想（不显示答案）</p>
          )}
        </div>
      </Card>

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={!input.trim()}
          className="flex-1 rounded-2xl bg-brand py-4 font-semibold text-white active:bg-brand-press disabled:opacity-40"
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

      {dictWord && <DictCard word={dictWord} onClose={() => setDictWord(null)} />}
    </div>
  )
}
