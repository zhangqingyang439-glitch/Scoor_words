import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CATEGORIES, ONLINE_DICTS, downloadDict, type OnlineDict } from '../onlineDicts'
import { deleteMyBook, listMyBooks } from '../db'

/**
 * 在线词库浏览器。
 *
 * 目录（373 部词典的名字和分类）是随 App 打包的，所以打开就能看、不用联网；
 * 只有真正点「下载」的时候才去取词条，取回来整本存进 IndexedDB，之后离线可用。
 */
export default function OnlineDicts({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const mine = useLiveQuery(() => listMyBooks(), []) ?? []
  const mineIds = useMemo(() => new Set(mine.map((b) => b.id)), [mine])

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return ONLINE_DICTS.filter((d) => {
      if (cat && d.cat !== cat) return false
      if (!kw) return true
      return d.name.toLowerCase().includes(kw) || d.id.toLowerCase().includes(kw)
    })
  }, [q, cat])

  async function add(d: OnlineDict) {
    if (busy) return
    setBusy(d.id)
    setMsg(null)
    try {
      const row = await downloadDict(d)
      setMsg({ ok: true, text: `已加入「${row.name}」，共 ${row.count} 词` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '下载失败' })
    } finally {
      setBusy(null)
    }
  }

  async function remove(d: OnlineDict) {
    if (busy) return
    await deleteMyBook(d.id)
    setMsg({ ok: true, text: `已移除「${d.name}」（学过的进度还留着）` })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--app-bg)]">
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3">
        <button onClick={onClose} className="text-sm text-zinc-400">
          ← 返回
        </button>
        <div className="flex-1 text-center font-medium">在线词库</div>
        <span className="w-12 text-right text-xs text-zinc-400">{ONLINE_DICTS.length} 部</span>
      </header>

      <div className="shrink-0 px-4 pt-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜词库：四级 / 雅思 / python / 日语…"
          className="w-full rounded-xl border border-zinc-200 bg-card px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
        />
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
          <Chip active={cat === null} onClick={() => setCat(null)}>
            全部
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(cat === c ? null : c)}>
              {c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28 pt-2">
        {list.length === 0 && <p className="py-10 text-center text-sm text-zinc-400">没找到，换个词试试</p>}
        {list.map((d) => {
          const has = mineIds.has(d.id)
          const loading = busy === d.id
          return (
            <div
              key={d.file}
              className="mb-2 flex items-center gap-3 rounded-xl bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{d.name}</div>
                <div className="mt-0.5 text-xs text-zinc-400">{d.cat}</div>
              </div>
              {has ? (
                <button
                  onClick={() => remove(d)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs text-zinc-400 active:bg-zinc-100"
                >
                  已加入 · 移除
                </button>
              ) : (
                <button
                  onClick={() => add(d)}
                  disabled={!!busy}
                  className="shrink-0 rounded-full bg-inverse px-3.5 py-1.5 text-xs text-inverse-ink disabled:opacity-40"
                >
                  {loading ? '下载中…' : '下载'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {msg && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 mx-auto w-fit max-w-[90%] rounded-full bg-inverse px-4 py-2 text-center text-xs text-inverse-ink shadow-lg">
          {msg.text}
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors ${
        active ? 'bg-inverse text-inverse-ink' : 'bg-card text-zinc-500'
      }`}
    >
      {children}
    </button>
  )
}
