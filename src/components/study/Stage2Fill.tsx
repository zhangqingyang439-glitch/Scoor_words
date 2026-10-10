import { useMemo, useState } from 'react'
import type { SessionItem } from '../../study'
import { recordAnswer, sensesOf } from '../../study'
import { matchMeaning } from '../../match'
import { SpeakButton } from '../SpeakButton'
import { DictCard } from '../DictCard'
import { Card, RecapCard } from './parts'

/**
 * 第2遍 · 看词填义：所有词性的空**一次全部摆出来**，全部填完点「检查」统一判定。
 * 错的空只标红提示「不对」，不显示答案，改完可反复检查；全对才进回看卡。
 * 「不会？看答案」直接进回看并整词放行；答错上报重考。
 */
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
  // 每组词性一个空：'pending' | 'ok' | 'wrong' | 'revealed'
  const [state, setState] = useState<Record<number, 'pending' | 'ok' | 'wrong' | 'revealed'>>({})
  const [inputs, setInputs] = useState<Record<number, string>>({})
  const [recap, setRecap] = useState<{ ok: boolean; revealAll?: boolean } | null>(null)
  const [dictWord, setDictWord] = useState<string | null>(null)

  // 待判定的空（没答对过也没看答案的）
  const openIdx = senses.map((_, i) => i).filter((i) => (state[i] ?? 'pending') === 'pending' || state[i] === 'wrong')
  const allFilled = openIdx.every((i) => (inputs[i] ?? '').trim().length > 0)

  /** 统一检查：全对 → 回看卡；有错 → 只标红，不给答案，留着改 */
  async function checkAll() {
    if (recap || !allFilled) return
    const next = { ...state }
    let anyWrong = false
    for (const i of openIdx) {
      if (matchMeaning(inputs[i] ?? '', senses[i].zh)) next[i] = 'ok'
      else {
        next[i] = 'wrong'
        anyWrong = true
      }
    }
    setState(next)
    if (anyWrong) {
      await recordAnswer(item, false)
      onError()
      return
    }
    await recordAnswer(item, true)
    setRecap({ ok: true })
  }

  /** 不会？直接看答案：进回看卡，继续时整词放行，稍后重现 */
  async function giveUp() {
    if (recap) return
    await recordAnswer(item, false)
    onError()
    setRecap({ ok: false, revealAll: true })
  }

  function continueRecap() {
    if (!recap) return
    if (recap.revealAll) {
      const next: Record<number, 'ok' | 'revealed' | 'wrong' | 'pending'> = { ...state }
      senses.forEach((_, i) => (next[i] = 'revealed'))
      setState(next)
    }
    setRecap(null)
    onDone()
  }

  if (recap) {
    return (
      <div className="flex flex-col gap-4">
        <RecapCard item={item} ok={recap.ok} onContinue={continueRecap} />
        {dictWord && <DictCard word={dictWord} onClose={() => setDictWord(null)} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card item={item}>
        <button onClick={() => setDictWord(w.name)} title="查看讲解" className="text-4xl font-bold tracking-wide active:opacity-70">
          {w.name}
        </button>
        <div className="mt-2 flex items-center justify-center gap-2 text-zinc-400">
          {w.usphone && <span>/{w.usphone}/</span>}
          <SpeakButton word={w.name} size="sm" />
        </div>

        <div className="mt-6 space-y-3 text-left">
          {senses.map((s, i) => {
            const st = state[i] ?? 'pending'
            const resolved = st === 'ok' || st === 'revealed'
            return (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      resolved ? 'bg-zinc-100 text-zinc-400' : st === 'wrong' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-600'
                    }`}
                  >
                    {s.pos}
                  </span>
                  {resolved ? (
                    <span className="text-sm text-zinc-500">{s.zh.join('；')}</span>
                  ) : (
                    <input
                      autoFocus={i === openIdx[0]}
                      value={inputs[i] ?? ''}
                      onChange={(e) => setInputs({ ...inputs, [i]: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && checkAll()}
                      placeholder="写一个中文意思"
                      className={`w-full rounded-lg border px-3 py-2 focus:outline-none ${
                        st === 'wrong'
                          ? 'border-red-300 focus:border-red-400'
                          : 'border-zinc-200 focus:border-emerald-400'
                      }`}
                    />
                  )}
                </div>
                {st === 'wrong' && (
                  <p className="mt-1 pl-1 text-xs text-red-400">✗ 这个不对，再想想（不显示答案）</p>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-center text-[11px] text-zinc-300">
          {senses.length > 1 ? '把每个词性的意思都填完，再点检查' : '填好后点检查 · 点单词可以看讲解'}
        </p>
      </Card>

      <div className="flex gap-3">
        <button
          onClick={checkAll}
          disabled={!allFilled}
          className="flex-1 rounded-2xl bg-brand py-4 font-semibold text-white active:bg-brand-press disabled:opacity-40"
        >
          {allFilled ? '检查' : '全部填完再检查'}
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
