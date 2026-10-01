import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  createWordBook,
  deleteWordBook,
  setCollect,
  listWordBooks,
  type WordBookRow,
  type WordProgress,
} from '../db'
import { BOOKS, loadBook, type BookWord } from '../books'
import { sensesOf } from '../study'
import { SpeakButton } from './SpeakButton'
import WordBookTree, { type TreeItem } from './WordBookTree'

/**
 * 记词本 = 一棵梅树。
 *
 * 每本单词书是枝上的一颗花苞；点开哪本，哪本才绽开成花，
 * 花下面涌出这本书的词。再点一下收回去，又变回花苞。
 *
 * 展开的面板高度是写死的（PANEL_H），因为树的排版要靠它算 ——
 * 枝干是绝对定位画在底下的，行高不确定的话枝子就对不上了。
 * 所以词表在面板内部自己滚。
 */

const PANEL_H = 300

export default function Notebook({ onReview }: { onReview: (wordBookId: string, selectedIds?: string[]) => void }) {
  const books = useLiveQuery(() => listWordBooks(), [])
  const progress = useLiveQuery(() => db.progress.toArray(), [])
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [wordMaps, setWordMaps] = useState<Map<string, BookWord>>(new Map())
  // 精确复习：勾选的进度行 id
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // 词书词形数据（自定义词用 progress.customData，不需要查）
  useEffect(() => {
    let alive = true
    ;(async () => {
      const map = new Map<string, BookWord>()
      for (const b of BOOKS) {
        try {
          const words = await loadBook(b)
          for (const w of words) map.set(`${b.id}:${w.name}`, w)
        } catch {
          // 忽略加载失败
        }
      }
      if (alive) setWordMaps(map)
    })()
    return () => {
      alive = false
    }
  }, [])

  const collected = (progress ?? []).filter((r) => r.collectedIn)
  const rowsOf = (id: string): WordProgress[] =>
    collected
      .filter((r) => r.collectedIn === id)
      .sort((a, b) => a.bookId.localeCompare(b.bookId) || a.order - b.order)

  async function submitCreate() {
    if (!newName.trim()) return
    const row = await createWordBook(newName)
    setNewName('')
    setCreating(false)
    setOpenId(row.id) // 新建的直接绽开，省得还要再点一下
  }

  async function removeBook(b: WordBookRow) {
    if (!confirm(`删除《${b.name}》？书里的单词会回到未收藏状态，学习记录保留。`)) return
    await deleteWordBook(b.id)
    setOpenId(null)
  }

  /** 真删除：自定义词彻底删掉；词书词只是移出本书 */
  async function removeRow(r: WordProgress) {
    if (r.bookId === '__custom__') {
      if (!confirm(`彻底删除「${r.word}」？它的学习记录也会一并清掉。`)) return
      await db.progress.delete(r.id)
    } else {
      await setCollect(r.bookId, r.word, r.order, null)
    }
  }

  function wordOf(r: WordProgress): BookWord | null {
    if (r.customData) {
      return {
        name: r.word,
        trans: r.customData.senses.map((s) => s.zh.join('；')),
        senses: r.customData.senses,
        usphone: r.customData.usphone,
        forms: r.customData.forms,
      }
    }
    return wordMaps.get(`${r.bookId}:${r.word}`) ?? null
  }

  function togglePick(id: string) {
    setPicked((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function pickFirstN(n: number) {
    if (!openId) return
    const rows = rowsOf(openId)
    setPicked(new Set(rows.slice(0, n).map((r) => r.id)))
  }

  function closeAll() {
    setOpenId(null)
    setPicking(false)
    setPicked(new Set())
  }

  /** 点花：点开的那朵绽开、露出底下的词；再点一下收回成花苞 */
  function activate(item: TreeItem) {
    if (openId === item.id) {
      closeAll()
    } else {
      setOpenId(item.id)
      setPicking(false)
      setPicked(new Set())
    }
  }

  const items: TreeItem[] = (books ?? []).map((b) => {
    const rows = rowsOf(b.id)
    const open = openId === b.id
    return {
      id: b.id,
      name: b.name,
      desc: rows.length === 0 ? '还是空的 · 学习时点 ✓ 收藏进来' : `${rows.length} 词`,
      open,
      // 空书不需要 300px 的白板，给一条矮的就够
      panelHeight: open ? (rows.length === 0 ? 108 : PANEL_H) : 0,
      panel: open ? (
        <BookPanel
          book={b}
          rows={rows}
          picking={picking}
          picked={picked}
          wordOf={wordOf}
          onTogglePick={togglePick}
          onPickFirstN={pickFirstN}
          onRemoveRow={removeRow}
          onRemoveBook={removeBook}
          onStartPicking={() => {
            setPicking(true)
            setPicked(new Set())
          }}
          onReview={(ids) => onReview(b.id, ids)}
        />
      ) : undefined,
    }
  })

  return (
    <div className="flex flex-col gap-2">
      {/* pr-16 给右上角的梅枝音乐开关让位 */}
      <div className="flex items-center justify-between pr-16">
        <h1 className="text-2xl font-bold">记词本</h1>
        <button
          onClick={() => setCreating(true)}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white active:bg-brand-press"
        >
          ＋ 新建单词书
        </button>
      </div>
      <p className="text-sm text-zinc-500">把收藏的单词分门别类，点开哪本，哪本开花</p>

      {creating && (
        <div className="flex gap-2 rounded-2xl bg-card p-4 shadow-sm">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
            placeholder="书名，如：雅思核心"
            className="flex-1 rounded-lg border border-zinc-200 px-3 py-2 focus:border-emerald-400 focus:outline-none"
          />
          <button onClick={submitCreate} className="rounded-lg bg-brand px-4 text-sm font-medium text-white">
            创建
          </button>
        </div>
      )}

      {books === undefined ? (
        <p className="mt-10 text-center text-zinc-400">加载中…</p>
      ) : books.length === 0 ? (
        <div className="mt-16 text-center text-zinc-400">还没有单词书，点右上角新建一本</div>
      ) : (
        <WordBookTree items={items} activeId={openId} onActivate={activate} />
      )}

      {picking && (
        <div className="tabbar fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-zinc-200 bg-card p-4">
          <button
            onClick={() => {
              if (picked.size === 0 || !openId) return
              onReview(openId, [...picked])
            }}
            disabled={picked.size === 0}
            className="w-full rounded-2xl bg-brand py-3.5 font-semibold text-white disabled:opacity-40"
          >
            开始复习（已选 {picked.size} 词）
          </button>
        </div>
      )}
    </div>
  )
}

/** 花开之后挂在花下面的那块：这本书的词 + 复习入口 */
function BookPanel({
  book,
  rows,
  picking,
  picked,
  wordOf,
  onTogglePick,
  onPickFirstN,
  onRemoveRow,
  onRemoveBook,
  onStartPicking,
  onReview,
}: {
  book: WordBookRow
  rows: WordProgress[]
  picking: boolean
  picked: Set<string>
  wordOf: (r: WordProgress) => BookWord | null
  onTogglePick: (id: string) => void
  onPickFirstN: (n: number) => void
  onRemoveRow: (r: WordProgress) => void
  onRemoveBook: (b: WordBookRow) => void
  onStartPicking: () => void
  onReview: (ids?: string[]) => void
}) {
  return (
    <div className="ml-[42px] mr-2 flex h-full flex-col rounded-2xl bg-card p-3 shadow-sm">
      <div className="flex shrink-0 flex-wrap gap-2">
        {rows.length > 0 && !picking && (
          <>
            <button
              onClick={() => onReview()}
              className="rounded-xl bg-brand px-3.5 py-2 text-xs font-medium text-white active:bg-brand-press"
            >
              整体复习（{rows.length}）
            </button>
            <button
              onClick={onStartPicking}
              className="rounded-xl bg-inverse px-3.5 py-2 text-xs font-medium text-inverse-ink active:bg-inverse/85"
            >
              精确复习
            </button>
          </>
        )}
        {picking && (
          <>
            <button
              onClick={() => onPickFirstN(10)}
              disabled={rows.length < 1}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 disabled:opacity-40"
            >
              前 10 个
            </button>
            <button
              onClick={() => onPickFirstN(20)}
              disabled={rows.length < 1}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600 disabled:opacity-40"
            >
              前 20
            </button>
            <button
              onClick={() => onPickFirstN(rows.length)}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600"
            >
              全选
            </button>
            <span className="text-xs text-zinc-400">点词勾选，勾几个复习几个</span>
          </>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <div className="text-4xl">🫙</div>
          <p className="text-sm text-zinc-500">这本书还是空的</p>
          <p className="text-xs text-zinc-400">学习时点 ✓ 或在首页查词添加时会让你选书</p>
        </div>
      ) : (
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {rows.map((r) => {
            const w = wordOf(r)
            const senses = w ? sensesOf(w) : null
            const checked = picked.has(r.id)
            return (
              <div
                key={r.id}
                className={`flex items-center gap-2 border-b border-zinc-100 py-2 last:border-0 ${
                  picking ? 'cursor-pointer' : ''
                }`}
                onClick={() => picking && onTogglePick(r.id)}
              >
                {picking && (
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      checked ? 'border-emerald-500 bg-brand' : 'border-zinc-300 bg-card'
                    }`}
                  >
                    {checked && (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4.5 12.5l5 5 10-11" />
                      </svg>
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-semibold">{r.word}</span>
                    <SpeakButton word={r.word} size="sm" />
                    {r.stage >= 4 ? (
                      <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600">已通关</span>
                    ) : r.stage > 0 ? (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-500">
                        第 {r.stage} 遍
                      </span>
                    ) : null}
                  </div>
                  {senses && (
                    <p className="mt-0.5 truncate text-xs text-zinc-400">
                      {senses.map((s) => `${s.pos} ${s.zh[0] ?? ''}`).join('；')}
                    </p>
                  )}
                </div>
                {!picking && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveRow(r)
                    }}
                    className="shrink-0 px-1.5 text-zinc-400"
                    title={r.bookId === '__custom__' ? '彻底删除' : '移出本书'}
                  >
                    {r.bookId === '__custom__' ? '🗑' : '✕'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!picking && (
        <button
          onClick={() => onRemoveBook(book)}
          className="mt-2 shrink-0 self-start text-[11px] text-zinc-400 underline"
        >
          删除这本书
        </button>
      )}
    </div>
  )
}
