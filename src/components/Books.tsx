import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BOOKS, type BookMeta } from '../books'
import { db, getPlan, listMyBooks, savePlan, type BookPlan } from '../db'
import { dailyQuota } from '../study'
import WordBookTree, { type TreeItem } from './WordBookTree'
import OnlineDicts from './OnlineDicts'

/** 计划面板的高度。必须写死 —— 枝干是绝对定位画的，行高不定就对不齐 */
const PLAN_PANEL_H = 186

export default function Books({ currentId, onPick }: { currentId: string | null; onPick: (id: string) => void }) {
  const plans = useLiveQuery(() => db.plans.toArray(), [])
  const [showOnline, setShowOnline] = useState(false)

  /**
   * 树上每一朵花就是一部词典。
   * 和记词本一样：没在用的都是花苞，正在用的那本才绽开。
   * 点一朵花苞 = 换成那本词书，它开花、原来那朵合上。
   *
   * 下载来的书直接从 IndexedDB 的结果渲染（不等 BOOKS 同步），
   * 否则刚点完下载要等下一次渲染才出现。
   */
  const mine = useLiveQuery(() => listMyBooks(), [])
  const items: TreeItem[] = [
    // 在线词库那朵不参与开合 —— 它是个入口，不是一本词书
    { id: '__online__', name: '在线词库', desc: '上网找词书 · 372 部可选', open: true },
    ...BOOKS.filter((b) => b.source !== 'mine').map((b) => bookItem(b, plans, currentId)),
    ...(mine ?? []).map((r) =>
      bookItem(
        {
          id: r.id,
          name: r.name,
          description: r.description,
          count: r.count,
          file: '',
          source: 'mine',
          category: r.category,
        },
        plans,
        currentId,
      ),
    ),
  ]

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">选择词书</h1>
      <p className="text-sm text-zinc-500">点哪本哪本开花，切换词书不会丢失其它词书的学习进度</p>

      <WordBookTree
        items={items}
        activeId={currentId}
        onActivate={(it) => (it.id === '__online__' ? setShowOnline(true) : onPick(it.id))}
      />

      {showOnline && <OnlineDicts onClose={() => setShowOnline(false)} />}
    </div>
  )
}

function planOf(bookId: string, plans: BookPlan[] | undefined): BookPlan | undefined {
  return plans?.find((x) => x.bookId === bookId)
}

/** 一本书在树上长什么样：正在用的那本开花，花下面挂学习计划 */
function bookItem(b: BookMeta, plans: BookPlan[] | undefined, currentId: string | null): TreeItem {
  const p = planOf(b.id, plans)
  const current = b.id === currentId
  return {
    id: b.id,
    name: b.name,
    desc: p ? `共 ${b.count} 词 · 每日 ${dailyQuota(b, p)} 词` : `共 ${b.count} 词 · 未设置计划`,
    open: current,
    panelHeight: PLAN_PANEL_H,
    panel: current ? (
      <div className="ml-[42px] mr-2 h-full rounded-2xl bg-card p-3 shadow-sm">
        <PlanEditor book={b} />
      </div>
    ) : undefined,
  }
}

function PlanEditor({ book }: { book: BookMeta }) {
  const [plan, setPlan] = useState<BookPlan | null>(null)
  const [daysText, setDaysText] = useState('')
  const [perDayText, setPerDayText] = useState('')

  useEffect(() => {
    getPlan(book.id).then((p) => {
      setPlan(p)
      setDaysText(p.mode === 'days' && p.days > 0 ? String(p.days) : '')
      setPerDayText(p.mode === 'perDay' ? String(p.perDay) : String(dailyQuota(book, p)))
    })
  }, [book.id, book])

  async function apply(mode: 'days' | 'perDay', raw: string) {
    const n = Math.max(1, Math.min(3650, Math.floor(Number(raw) || 0)))
    if (!n) return
    const next: BookPlan =
      mode === 'days'
        ? { bookId: book.id, mode: 'days', days: n, perDay: Math.ceil(book.count / n) }
        : { bookId: book.id, mode: 'perDay', days: Math.ceil(book.count / n), perDay: n }
    await savePlan(next)
    setPlan(next)
    setDaysText(String(next.days))
    setPerDayText(String(next.perDay))
  }

  if (!plan) return null

  return (
    <div className="flex h-full flex-col">
      <div className="text-sm font-medium">多久背完这本</div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input
          type="number"
          min={1}
          value={daysText}
          onChange={(e) => setDaysText(e.target.value)}
          onBlur={() => apply('days', daysText)}
          onKeyDown={(e) => e.key === 'Enter' && apply('days', daysText)}
          className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-center text-sm"
        />
        <span className="text-xs text-zinc-400">
          天（每日 {Math.ceil(book.count / Math.max(1, Number(daysText) || book.count))} 词）
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <input
          type="number"
          min={1}
          value={perDayText}
          onChange={(e) => setPerDayText(e.target.value)}
          onBlur={() => apply('perDay', perDayText)}
          onKeyDown={(e) => e.key === 'Enter' && apply('perDay', perDayText)}
          className="w-16 rounded-lg border border-zinc-200 px-2 py-1 text-center text-sm"
        />
        <span className="text-xs text-zinc-400">
          词/天（约 {plan.perDay > 0 ? Math.ceil(book.count / plan.perDay) : '—'} 天背完）
        </span>
      </div>
      <p className="mt-auto text-[11px] text-zinc-400">
        当前生效：每天 {dailyQuota(book, plan)} 个新词，额度背完还能继续加背
      </p>
    </div>
  )
}
