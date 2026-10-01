import { Fragment, type ReactNode } from 'react'
import { PlumBlossom } from './BranchSvg'

/**
 * 梅树列表。
 *
 * 一条梅枝从画面底部往上长，每一朵花就是一本词书 ——
 * 花直接开在枝干上（跟真梅花一样），名字写在花的右边。
 *
 * 两种用法：
 *   · 词书页：花一直是开的，当前那本画得更实
 *   · 记词本：没点开的是花苞，点开学习才绽开成花（open 字段控制）
 *
 * 为什么不做成左右分叉的树冠：手机上文字得有地方放。
 * 花排在一条枝上，名字才能对齐成一列，扫一眼就能读完；
 * 枝条的走势和旁边的小杈负责"这是一棵树"的感觉。
 */

export interface TreeItem {
  id: string
  name: string
  desc: string
  /** 花苞(false)还是开了的花(true)。不传就是一直开着 */
  open?: boolean
  /** 行尾的小标记，比如「使用中」 */
  badge?: string
  /** 花开时挂在花下面的东西（比如单词列表）。高度必须用 panelHeight 给死，树的排版靠它算 */
  panel?: ReactNode
  panelHeight?: number
}

const ROW_H = 78
const PAD_TOP = 30
const PAD_BOTTOM = 30
const FLOWER = 30

/** 枝干在第 i 行的横向位置：轻微S形，不做成一根直尺 */
function trunkX(t: number): number {
  return 40 + 6 * Math.sin(Math.PI * t)
}

interface Pt {
  x: number
  y: number
}

/** 用 Catmull-Rom 把点串成平滑曲线，逐段输出（每段能单独给粗细，做出下粗上细） */
function taperSegments(pts: Pt[]): { d: string; w: number }[] {
  const out: { d: string; w: number }[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    const t = (i + 0.5) / Math.max(1, pts.length - 1)
    out.push({
      d: `M${p1.x} ${p1.y} C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`,
      w: 1.25 + 1.35 * t, // 越往根部越粗
    })
  }
  return out
}

export default function WordBookTree({
  items,
  activeId = null,
  onActivate,
  renderTrailing,
}: {
  items: TreeItem[]
  activeId?: string | null
  onActivate: (item: TreeItem) => void
  renderTrailing?: (item: TreeItem) => ReactNode
}) {
  const n = items.length

  // 逐行往下排：展开的那行下面要额外留出面板的高度
  const tops: number[] = []
  let y = PAD_TOP
  for (const it of items) {
    tops.push(y)
    y += ROW_H + (it.open && it.panel ? (it.panelHeight ?? 0) : 0)
  }
  const height = y + PAD_BOTTOM

  const centerY = (i: number) => tops[i] + ROW_H / 2
  const tOf = (i: number) => (n <= 1 ? 0 : i / (n - 1))

  const trunk: Pt[] = items.map((_, i) => ({ x: trunkX(tOf(i)), y: centerY(i) }))
  // 底下再延一节，让枝子像是从画面外面长上来的
  if (trunk.length) trunk.push({ x: trunkX(1) - 9, y: height + 24 })
  const segments = taperSegments(trunk)

  return (
    <div className="relative" style={{ height }}>
      <svg className="absolute inset-0 overflow-visible" width="100%" height={height} aria-hidden="true">
        {segments.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={s.w}
            strokeLinecap="round"
            className="text-zinc-400"
          />
        ))}

        {/* 枝干上的小杈，负责"这是一棵树" */}
        {items.map((_, i) => {
          if (i === 0) return null
          const t = (i - 0.5) / Math.max(1, n - 1)
          const x = trunkX(t)
          const my = (centerY(i - 1) + centerY(i)) / 2
          const len = 15 + ((i * 7) % 9)
          return (
            <path
              key={`t${i}`}
              d={`M${x} ${my} C${x - len * 0.35} ${my - 3} ${x - len * 0.7} ${my - 6} ${x - len} ${my - 12}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.05"
              strokeLinecap="round"
              className="text-zinc-400"
              opacity="0.75"
            />
          )
        })}
      </svg>

      {items.map((it, i) => {
        const active = it.id === activeId
        const open = it.open ?? true
        return (
          <Fragment key={it.id}>
            <button
              type="button"
              onClick={() => onActivate(it)}
              aria-expanded={it.panel ? open : undefined}
              aria-current={active ? 'true' : undefined}
              className={`absolute right-0 flex items-center gap-3 rounded-2xl py-2 pr-3 text-left transition-colors active:bg-zinc-100 ${
                active ? 'text-zinc-900' : 'text-zinc-600'
              }`}
              style={{
                top: tops[i],
                height: ROW_H - 6,
                left: 0,
                paddingLeft: trunkX(tOf(i)) - FLOWER / 2,
              }}
            >
              <PlumBlossom
                size={FLOWER}
                open={open}
                full={active}
                plus={it.id === '__online__'}
                className={
                  active || open
                    ? 'shrink-0 text-zinc-800'
                    : 'shrink-0 text-zinc-500'
                }
              />
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[15px] ${active ? 'font-semibold' : 'font-medium'}`}>
                  {it.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-zinc-400">{it.desc}</span>
              </span>
              {it.badge && (
                <span className="shrink-0 rounded-full bg-inverse px-2.5 py-0.5 text-[11px] text-inverse-ink">
                  {it.badge}
                </span>
              )}
              {renderTrailing?.(it)}
            </button>

            {open && it.panel && (
              <div
                className="absolute left-0 right-0 z-10 overflow-hidden"
                style={{ top: tops[i] + ROW_H - 6, height: it.panelHeight }}
              >
                {it.panel}
              </div>
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
