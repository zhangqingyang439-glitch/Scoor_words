import { useEffect, useMemo, useState } from 'react'
import type { SessionItem } from '../../study'
import { sensesOf } from '../../study'
import { tokenize } from '../../match'
import { speakSentence, speakWord } from '../speech'
import { useSentenceData } from '../useSentenceData'
import { DictCard } from '../DictCard'
import { SpeakButton } from '../SpeakButton'
import { Card } from './parts'
import { cacheCNTranslation, getCachedCN, translateOnline } from '../../cn'

/** 拆复合词条时排除的虚词：不然 "the arctic" 会把句子里所有 the 都高亮 */
const STOP_TARGETS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'modal', 'not'])

/** 第4遍 · 例句翻译：写翻译（不判对错），提交后看详细讲解；
 *  例句里目标词高亮、短语划线标出，配短语表 + 句子结构讲解；
 *  词库例句没带翻译时联网在线翻译兜底（结果缓存，离线可复看） */
export default function Stage4Sentence({
  item,
  onDone,
}: {
  item: SessionItem
  onDone: () => void
}) {
  const w = item.word
  const data = useSentenceData()
  const entry = data.s[w.name.toLowerCase()] ?? null
  const mnem = data.m[w.name.toLowerCase()]
  const [text, setText] = useState('')
  const [explained, setExplained] = useState(false)
  const [dictWord, setDictWord] = useState<string | null>(null)
  // 词库例句没带中文翻译时的在线翻译兜底
  const [onlineZh, setOnlineZh] = useState<{ text?: string; loading: boolean } | null>(null)

  const targets = useMemo(() => {
    const base: string[] = [w.name, ...(w.forms ?? [])]
    // 复合词条（"mobile phone"、"arise arose arisen" 这类）拆开成单词也能高亮
    for (const t of w.name.split(/[\s\-/=]+/)) {
      if (t.length >= 2 && /^[a-zA-Z][a-zA-Z'-]*$/.test(t) && !STOP_TARGETS.has(t.toLowerCase())) base.push(t)
    }
    return base
  }, [w])
  const isTarget = (t: string) => targets.map((x) => x.toLowerCase()).includes(t.toLowerCase())

  useEffect(() => {
    if (!entry || entry.zh) {
      setOnlineZh(null)
      return
    }
    let alive = true
    setOnlineZh({ loading: true })
    void (async () => {
      const cached = await getCachedCN(entry.en)
      if (cached) {
        if (alive) setOnlineZh({ text: cached, loading: false })
        return
      }
      if (!navigator.onLine) {
        if (alive) setOnlineZh({ loading: false })
        return
      }
      const t = await translateOnline(entry.en, 'en-zh')
      if (t) await cacheCNTranslation(entry.en, t)
      if (alive) setOnlineZh({ text: t ?? undefined, loading: false })
    })()
    return () => {
      alive = false
    }
  }, [entry])

  /** 例句按词切开：目标词高亮、短语整段划线，单词可点击查词典 */
  const sentenceParts = useMemo(() => {
    if (!entry) return []
    const parts: Array<{ text: string; word?: string; hit: boolean; phrase?: number }> = []
    const re = /[a-zA-Z']+/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(entry.en))) {
      if (m.index > last) parts.push({ text: entry.en.slice(last, m.index), hit: false })
      parts.push({ text: m[0], word: m[0], hit: isTarget(m[0]) })
      last = m.index + m[0].length
    }
    if (last < entry.en.length) parts.push({ text: entry.en.slice(last), hit: false })

    // 短语标注：把短语的词序列往句子的词序列上对，对上的整段划线（目标词高亮优先）。
    // 短语表里写 "be ..."，句子里是 am/is/are/was/were —— 逐个变位试
    if (entry.phrases?.length) {
      const wordIdx: number[] = []
      parts.forEach((p, i) => p.word && wordIdx.push(i))
      const beForms = ['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']
      entry.phrases.forEach((ph, pi) => {
        const base = ph.p.toLowerCase().match(/[a-z']+/g) ?? []
        if (base.length === 0) return
        const candidates = base[0] === 'be' ? beForms.map((f) => [f, ...base.slice(1)]) : [base]
        for (const ptoks of candidates) {
          for (let s = 0; s + ptoks.length <= wordIdx.length; s++) {
            let matched = true
            for (let k = 0; k < ptoks.length; k++) {
              if (parts[wordIdx[s + k]].word!.toLowerCase() !== ptoks[k]) {
                matched = false
                break
              }
            }
            if (matched) {
              for (let k = 0; k < ptoks.length; k++) {
                const p = parts[wordIdx[s + k]]
                if (!p.hit && p.phrase === undefined) p.phrase = pi
              }
              return
            }
          }
        }
      })
    }
    return parts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, targets])

  const tokenGlosses = useMemo(() => {
    if (!entry) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const tk of tokenize(entry.en)) {
      const key = tk.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      if (data.g[key]) out.push(key)
    }
    return out
  }, [entry, data.g])

  const senses = useMemo(() => sensesOf(w), [w])
  const loading = Object.keys(data.s).length === 0 && Object.keys(data.g).length === 0

  return (
    <div className="flex flex-col gap-4">
      <Card item={item}>
        {loading ? (
          <p className="py-8 text-sm text-zinc-400">正在找例句…</p>
        ) : !entry ? (
          <div className="py-8">
            <p className="text-4xl">📖</p>
            <p className="mt-3 text-sm text-zinc-500">「{w.name}」暂无例句，背熟释义也行</p>
            <div className="mt-4 space-y-2 text-left">
              {senses.map((s, i) => (
                <p key={i} className="rounded-lg bg-zinc-50 px-4 py-2">
                  <span className="mr-2 text-xs font-medium text-emerald-600">{s.pos}</span>
                  <span className="text-zinc-700">{s.zh.join('；')}</span>
                </p>
              ))}
            </div>
          </div>
        ) : (
          <>
            <p className="text-left text-lg leading-relaxed">
              {sentenceParts.map((p, i) =>
                p.word && p.phrase === undefined ? (
                  <button
                    key={i}
                    onClick={() => setDictWord(p.word!)}
                    className={`mx-px rounded px-0.5 active:bg-emerald-100 ${
                      p.hit ? 'font-semibold text-emerald-600' : 'text-zinc-800 underline decoration-zinc-200 underline-offset-4'
                    }`}
                  >
                    {p.text}
                  </button>
                ) : p.word ? (
                  <span
                    key={i}
                    className="mx-px rounded px-0.5 text-amber-500 underline decoration-amber-300/80 decoration-2 underline-offset-4"
                  >
                    {p.text}
                  </span>
                ) : (
                  <span key={i}>{p.text}</span>
                ),
              )}
            </p>
            <p className="mt-2 text-center text-xs text-zinc-300">
              点单词查词典{entry.phrases?.length ? ' · 划线的是短语' : ''}
              {entry.src === 'tatoeba'
                ? ' · 例句来自 Tatoeba (CC-BY)'
                : entry.src === 'ted'
                  ? ' · 例句来自 TED (CC BY-NC-ND)'
                  : entry.src === 'ai'
                    ? ' · AI 例句'
                    : ''}
            </p>
            <div className="mt-1 flex items-center justify-center gap-3">
              <SpeakButton word={w.name} size="sm" />
              <button onClick={() => speakSentence(entry.en)} className="text-sm text-zinc-400">
                🔊 朗读例句
              </button>
            </div>

            {!explained ? (
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                placeholder="把这句话翻译成中文（不判对错，写你的理解）"
                className="mt-5 w-full rounded-xl border border-zinc-200 px-4 py-3 focus:border-emerald-400 focus:outline-none"
              />
            ) : (
              <div className="mt-5 space-y-3 text-left">
                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                  <div className="text-xs font-medium text-emerald-600">
                    整句意思{!entry.zh && onlineZh?.text ? '（在线翻译 · 已缓存可离线查看）' : ''}
                  </div>
                  <div className="mt-1 text-zinc-700">
                    {entry.zh ??
                      (onlineZh?.loading ? '翻译中…' : onlineZh?.text ?? '当前离线，联网后可显示整句翻译')}
                  </div>
                </div>
                {entry.gr && (
                  <div className="rounded-xl bg-violet-50 px-4 py-3">
                    <div className="text-xs font-medium text-violet-500">句子结构</div>
                    <div className="mt-1 text-sm leading-relaxed text-zinc-700">{entry.gr}</div>
                  </div>
                )}
                {entry.phrases && entry.phrases.length > 0 && (
                  <div className="rounded-xl bg-sky-50 px-4 py-3">
                    <div className="text-xs font-medium text-sky-500">短语 · 搭配</div>
                    <div className="mt-2 space-y-1">
                      {entry.phrases.map((ph) => (
                        <p key={ph.p} className="text-sm">
                          <span className="font-medium text-zinc-800">{ph.p}</span>
                          <span className="ml-2 text-zinc-500">{ph.zh}</span>
                        </p>
                      ))}
                    </div>
                  </div>
                )}
                <div className="rounded-xl bg-zinc-50 px-4 py-3">
                  <div className="text-xs font-medium text-zinc-500">「{w.name}」的完整释义</div>
                  <div className="mt-2 space-y-1.5">
                    {senses.map((s, i) => (
                      <p key={i} className="text-sm">
                        <span className="mr-2 font-medium text-emerald-600">{s.pos}</span>
                        <span className="text-zinc-700">{s.zh.join('；')}</span>
                      </p>
                    ))}
                  </div>
                </div>
                {tokenGlosses.length > 0 && (
                  <div className="rounded-xl bg-zinc-50 px-4 py-3">
                    <div className="text-xs font-medium text-zinc-500">逐词释义（点击查词典）</div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {tokenGlosses.map((t) => (
                        <button key={t} onClick={() => setDictWord(t)} className="text-sm active:opacity-60">
                          <span className={isTarget(t) ? 'font-semibold text-emerald-600' : 'text-zinc-700'}>{t}</span>
                          <span className="ml-1 text-zinc-400">{data.g[t]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {mnem && (
                  <div className="rounded-xl bg-amber-50 px-4 py-3">
                    <div className="text-xs font-medium text-amber-500">🧠 速记法</div>
                    <div className="mt-1 text-sm leading-relaxed text-zinc-600">{mnem}</div>
                  </div>
                )}
                <div className="rounded-xl bg-zinc-50 px-4 py-3">
                  <div className="text-xs font-medium text-zinc-500">你的翻译</div>
                  <div className="mt-1 whitespace-pre-wrap text-zinc-700">{text || '（未作答）'}</div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {!loading && (
        explained || !entry ? (
          <button
            onClick={onDone}
            className="rounded-2xl bg-brand py-4 font-semibold text-white active:bg-brand-press"
          >
            完成 🎉
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => {
                setExplained(true)
                if (entry) speakSentence(entry.en)
              }}
              className="flex-1 rounded-2xl bg-brand py-4 font-semibold text-white active:bg-brand-press"
            >
              提交，看讲解
            </button>
            <button
              onClick={onDone}
              className="rounded-2xl bg-zinc-200 px-5 py-4 font-medium text-zinc-600 active:bg-zinc-300"
            >
              跳过
            </button>
          </div>
        )
      )}

      {dictWord && <DictCard word={dictWord} onClose={() => setDictWord(null)} />}
    </div>
  )
}
