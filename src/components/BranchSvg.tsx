import type { CSSProperties } from 'react'

/**
 * 梅枝（纯 SVG，不管交互）。
 *
 * 照着真实白梅照片画的。有四个特征是"这是不是梅花"的关键：
 *  · 枝条硬朗、中间**带折角**，不是平滑的弧线（疏影横斜）
 *  · 花**直接贴在枝干上**开，几乎没有花梗
 *  · 五片**圆瓣**平铺，花心是**一簇密集花丝**，每根顶端一个小点
 *  · 枝上永远挂着圆鼓鼓的花苞，花开时它收成花心
 *
 * 两档细节：
 *   simple —— 给右上角 40px 的开关用，花丝在那个尺寸下会糊成一团，只画花瓣
 *   rich   —— 给开场页用，花瓣 + 花丝 + 花药都画得出来
 *
 * 全部只描边不填色，和那支线描冰淇淋是同一套笔法。
 */

/** 主干：从右上角插进来，中间拐一下再挑上去 */
const STEM = 'M47 5 C41 11 35 16 28 19 C25 20.3 23 19.5 21 17 C18 13.5 14 11 9 11'

/** 两根小侧枝，让层次多起来。起点必须落在主干上，否则会像悬空的一根 */
const TWIGS = ['M30 18.4 C28 15.6 25 13.6 21 12.6', 'M38 13.1 C37 10 35 7.4 32 5.6']

/** 花贴着枝干长，位置就落在枝条的走势上 */
interface Bloom {
  x: number
  y: number
  /** 朝哪个方向开。照片里的花是斜着往外开的，不是一律朝上 */
  rot: number
  scale: number
}

/** rich：开场页用，四朵铺开，大小略有参差才像真的 */
const RICH_BLOOMS: Bloom[] = [
  { x: 39.5, y: 12.3, rot: -34, scale: 1 },
  { x: 32, y: 17, rot: -10, scale: 1.05 },
  { x: 22.5, y: 18.9, rot: 26, scale: 1 },
  { x: 15.2, y: 12.7, rot: 48, scale: 0.92 },
]

/** simple：40px 的开关用。只留三朵，而且放大 —— 按原比例画会糊成三个黑点 */
const SIMPLE_BLOOMS: Bloom[] = [
  { x: 38, y: 13.4, rot: -26, scale: 1.32 },
  { x: 26, y: 18.8, rot: 12, scale: 1.38 },
  { x: 16.5, y: 12.9, rot: 44, scale: 1.22 },
]

/** 没开的花苞：照片里枝梢永远挂着几颗，全开就不像梅花了 */
const BUDS = [
  { x: 44.8, y: 6.9, r: 1.1 },
  { x: 11, y: 10.9, r: 0.95 },
]

/** 一片花瓣朝上，其余四片按 72° 排开 */
const PETAL_ANGLES = [90, 162, 234, 306, 18]
/** 花丝 7 根，密一点才像梅花；长度到花瓣半径的六成左右 */
const STAMEN_ANGLES = [12, 63, 114, 168, 216, 268, 316]

const PETAL_DIST = 1.75
const PETAL_R = 1.35
const STAMEN_LEN = 1.95

/**
 * 单朵梅花。给「词书树」和「记词本树」用 —— 树上每一朵花就是一个词书。
 * 局部坐标系半径 12（所以 viewBox 是 -12..12）。
 *
 * open=false 时是一颗收着的花苞（圆鼓鼓的一颗，底下托着萼片）；
 * open=true 时花瓣绽开、花心亮出来。两者之间是过渡过去的，不是直接切换。
 */
export function PlumBlossom({
  size = 30,
  open = true,
  full = false,
  plus = false,
  className = '',
}: {
  size?: number
  /** 花苞还是开了的花 */
  open?: boolean
  /** 画全一点：花瓣更实、花丝吐出来（当前选中的那朵） */
  full?: boolean
  /** 用 + 代替花心（在线词库那朵） */
  plus?: boolean
  className?: string
}) {
  return (
    <svg
      viewBox="-12 -12 24 24"
      width={size}
      height={size}
      className={`plum-one ${open ? 'is-open' : ''} ${className}`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      {/* 绽开时从花心荡开的一圈水波。全站都是涟漪，花开也该有一下 */}
      <circle r="7" className="plum-ripple" stroke="currentColor" />

      {/* 花苞本体：没开的时候看到的就是这颗。
          不能画成圆点 —— 圆点看着就是个句号，不是花苞。
          用上尖下圆的卵形，底下的萼杯要**露在苞体外面**一截：
          画在苞体里面就读成一道高光了，不是托着它的萼片。 */}
      <g className="plum-bud-body">
        <path
          d="M0 -6.6 C2.7 -4.7 4 -1.9 4 0.8 C4 3.2 2.2 4.9 0 4.9 C-2.2 4.9 -4 3.2 -4 0.8 C-4 -1.9 -2.7 -4.7 0 -6.6 Z"
          fill="currentColor"
          opacity="0.85"
        />
        <path
          d="M-4.2 0.9 C-4.2 4.4 -2.2 6.6 0 6.6 C2.2 6.6 4.2 4.4 4.2 0.9"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path d="M-1.5 -5.4 Q0 -7.8 1.5 -5.4" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.5" />
      </g>

      {/* 花。
          花瓣逐片从花心长出来 —— 每片把自己的缩放锚点指回花心，
          再错开 60ms，才是"盛开"而不是"整朵一起放大"。 */}
      <g className="plum-bloom">
        <circle r="3.1" fill="currentColor" className="plum-calyx" opacity={full ? 0.9 : 0.5} />

        {PETAL_ANGLES.map((deg, i) => {
          const rad = (deg * Math.PI) / 180
          const cx = Math.cos(rad) * 5.4
          const cy = -Math.sin(rad) * 5.4
          const R = 4.3
          // 花心(0,0) 落在这片花瓣自身包围盒里的百分比位置
          const ox = ((0 - (cx - R)) / (2 * R)) * 100
          const oy = ((0 - (cy - R)) / (2 * R)) * 100
          return (
            <circle
              key={deg}
              cx={cx}
              cy={cy}
              r={R}
              stroke="currentColor"
              strokeWidth={full ? 1.35 : 1}
              opacity={full ? 1 : 0.62}
              className="plum-petal"
              style={{ transformOrigin: `${ox}% ${oy}%`, transitionDelay: `${i * 85}ms` }}
            />
          )
        })}

        {plus ? (
          <g stroke="currentColor" strokeWidth="1.5" opacity="0.9">
            <line x1="-2.4" y1="0" x2="2.4" y2="0" />
            <line x1="0" y1="-2.4" x2="0" y2="2.4" />
          </g>
        ) : (
          /* 花丝：先开瓣、再吐蕊，所以整体延后出现 */
          <g className="plum-stamens">
            {STAMEN_ANGLES.map((deg) => {
              const rad = (deg * Math.PI) / 180
              const x = Math.cos(rad) * 6.4
              const y = -Math.sin(rad) * 6.4
              return (
                <g key={deg}>
                  <line x1="0" y1="0" x2={x} y2={y} stroke="currentColor" strokeWidth="0.75" />
                  <circle cx={x} cy={y} r="0.85" fill="currentColor" />
                </g>
              )
            })}
          </g>
        )}
      </g>
    </svg>
  )
}

export function BranchSvg({
  on,
  ringing = -1,
  detail = 'simple',
  className = '',
  style,
  strokeScale = 1,
}: {
  on: boolean
  /** 正在被音符点亮的那一朵的下标 */
  ringing?: number
  detail?: 'simple' | 'rich'
  className?: string
  style?: CSSProperties
  /** 大尺寸时线条按比例加粗，不然显得太秃 */
  strokeScale?: number
}) {
  const blooms = detail === 'rich' ? RICH_BLOOMS : SIMPLE_BLOOMS

  return (
    <svg
      viewBox="0 0 48 48"
      className={`branch-svg ${on ? 'is-bloomed' : ''} ${className}`}
      style={style}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* 枝干：永远整根画出来 —— 冬天的梅枝本来就该是光枝 */}
      <path d={STEM} stroke="currentColor" strokeWidth={1.6 * strokeScale} className="plum-branch" />
      {TWIGS.map((d, i) => (
        <path key={i} d={d} stroke="currentColor" strokeWidth={1.25 * strokeScale} className="plum-branch" />
      ))}

      {/* 花：花萼一直在（没开时它就是花苞），点开之后花瓣绽开、花丝亮出来 */}
      {blooms.map((b, i) => (
        <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.rot}) scale(${b.scale})`}>
          <circle r="1.15" fill="currentColor" className="plum-calyx" />

          <g
            className={`plum-bloom ${ringing === i ? 'is-ringing' : ''}`}
            style={{ transitionDelay: `${110 + i * 130}ms` }}
          >
            {PETAL_ANGLES.map((deg) => {
              const r = (deg * Math.PI) / 180
              return (
                <circle
                  key={deg}
                  cx={Math.cos(r) * PETAL_DIST}
                  cy={-Math.sin(r) * PETAL_DIST}
                  r={PETAL_R}
                  stroke="currentColor"
                  strokeWidth={0.85 * strokeScale}
                  className="plum-petal"
                />
              )
            })}

            {detail === 'rich' &&
              STAMEN_ANGLES.map((deg) => {
                const r = (deg * Math.PI) / 180
                const x = Math.cos(r) * STAMEN_LEN
                const y = -Math.sin(r) * STAMEN_LEN
                return (
                  <g key={deg}>
                    <line
                      x1="0"
                      y1="0"
                      x2={x}
                      y2={y}
                      stroke="currentColor"
                      strokeWidth={0.42 * strokeScale}
                      className="plum-stamen"
                    />
                    <circle cx={x} cy={y} r={0.42 * strokeScale} fill="currentColor" className="plum-anther" />
                  </g>
                )
              })}
          </g>
        </g>
      ))}

      {/* 没开的花苞：不参与绽放，一直都在 */}
      {detail === 'rich' &&
        BUDS.map((b, i) => (
          <circle key={`bud${i}`} cx={b.x} cy={b.y} r={b.r} fill="currentColor" className="plum-bud" />
        ))}
    </svg>
  )
}
