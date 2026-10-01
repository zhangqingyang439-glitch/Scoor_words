import { useEffect, useRef, useState } from 'react'
import type { SessionItem } from '../../study'
import { sensesOf } from '../../study'
import { speakWord } from '../speech'
import { useSentenceData } from '../useSentenceData'
import { Card, CountdownRing } from './parts'

const SECONDS = 60

/** 第1遍 · 极速记忆：单词 + 释义 + 速记法，60 秒倒计时，可提前下一个 */
export default function Stage1Memorize({
  item,
  onDone,
}: {
  item: SessionItem
  onDone: (ok: boolean) => void
}) {
  const [left, setLeft] = useState(SECONDS)
  const doneRef = useRef(false)
  const w = item.word
  const senses = sensesOf(w)
  const data = useSentenceData()
  const mnem = data.m[w.name.toLowerCase()]

  useEffect(() => {
    speakWord(w.name)
  }, [w.name])

  useEffect(() => {
    doneRef.current = false
    setLeft(SECONDS)
    const timer = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          clearInterval(timer)
          if (!doneRef.current) {
            doneRef.current = true
            onDone(true)
          }
          return 0
        }
        return l - 1
      })
    }, 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item])

  function finish() {
    if (!doneRef.current) {
      doneRef.current = true
      onDone(true)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card item={item} top={<CountdownRing seconds={left} total={SECONDS} />}>
        <div className="text-4xl font-bold tracking-wide">{w.name}</div>
        {w.usphone && (
          <button onClick={() => speakWord(w.name)} className="mt-2 text-zinc-400">
            /{w.usphone}/ 🔊
          </button>
        )}
        <div className="mt-5 space-y-2 text-left">
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
      </Card>
      <button onClick={finish} className="rounded-2xl bg-inverse py-4 font-semibold text-inverse-ink active:bg-inverse/85">
        记住了，下一个 ↷
      </button>
    </div>
  )
}
