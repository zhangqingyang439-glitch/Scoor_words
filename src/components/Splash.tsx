import { useEffect, useMemo, useRef, useState } from 'react'
import { IceCreamIcon } from './IceCreamIcon'
import { BranchSvg } from './BranchSvg'
import { music } from '../music'

interface Flake {
  left: number
  size: number
  duration: number
  delay: number
  drift: number
  glyph: string
  opacity: number
  dot: boolean
}

/** 随机生成一批雪花：混合雪花字符与小圆点 */
function makeFlakes(): Flake[] {
  const glyphs = ['❄', '❅', '❆']
  const flakes: Flake[] = []
  for (let i = 0; i < 26; i++) {
    const dot = i % 3 === 2
    flakes.push({
      left: Math.random() * 100,
      size: dot ? 3 + Math.random() * 3 : 9 + Math.random() * 11,
      duration: 6 + Math.random() * 8,
      delay: -Math.random() * 12,
      drift: (Math.random() - 0.5) * 70,
      glyph: dot ? '' : glyphs[i % 3],
      opacity: 0.22 + Math.random() * 0.5,
      dot,
    })
  }
  return flakes
}

/* 石头入水的时间轴（毫秒）。整体比原来慢一倍，让水波真的"荡"过去。 */
const RING_COUNT = 4
const RING_STAGGER = 180
const RING_DURATION = 1900
const FLOOD_DELAY = 620
const FLOOD_DURATION = 1500
const FADE_AT = FLOOD_DELAY + FLOOD_DURATION - 60
const ENTER_AT = 2480

type Phase = 'idle' | 'ripple' | 'reveal'

/**
 * 黑白启动页：线描冰淇淋 + 雪花飘落 + 「进入」按钮。
 * 只有点这颗按钮才有反应，点别处什么都不发生。
 * 点下去像一颗石子落进静水：先是指腹下的两圈，接着同心水波一圈圈荡开，
 * 最后浪头漫过整屏，把首页冲出来。
 */
export default function Splash({ onEnter }: { onEnter: () => void }) {
  const [ready, setReady] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [stone, setStone] = useState<{ x: number; y: number; d: number } | null>(null)
  const [taps, setTaps] = useState<{ x: number; y: number; delay: number }[]>([])
  const [musicOn, setMusicOn] = useState(() => music.isEnabled())
  const [ringing, setRinging] = useState(-1)
  const timers = useRef<number[]>([])
  const flakes = useMemo(makeFlakes, [])

  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 900)
    return () => window.clearTimeout(t)
  }, [])

  // 右上角那根树枝跟着音乐状态走：开着就是绽开的
  useEffect(() => music.onStateChange(() => setMusicOn(music.isEnabled())), [])
  useEffect(() => {
    let timer: number | null = null
    const off = music.onNote(() => {
      setRinging(Math.floor(Math.random() * 5))
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => setRinging(-1), 760)
    })
    return () => {
      off()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((t) => window.clearTimeout(t))
  }, [])

  function later(fn: () => void, ms: number) {
    timers.current.push(window.setTimeout(fn, ms))
  }

  function enter(e: React.MouseEvent<HTMLButtonElement>) {
    if (phase !== 'idle' || !ready) return

    // 系统里关了动效就别硬做水波，直接进
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onEnter()
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()
    // 键盘（Enter/空格）触发时 clientX/Y 是 0，退到按钮中心
    const x = e.clientX || rect.left + rect.width / 2
    const y = e.clientY || rect.top + rect.height / 2
    const vw = window.innerWidth
    const vh = window.innerHeight
    // 刚好盖住整屏的直径：这样"浪头"要走到动画最后才漫过全屏，
    // 不会中途就变成一坨铺满的白块。
    const d =
      2 *
      Math.max(Math.hypot(x, y), Math.hypot(vw - x, y), Math.hypot(x, vh - y), Math.hypot(vw - x, vh - y))

    const localX = e.clientX - rect.left
    const localY = e.clientY - rect.top
    setTaps([
      { x: localX, y: localY, delay: 0 },
      { x: localX, y: localY, delay: 130 },
    ])
    setStone({ x, y, d })
    setPhase('ripple')

    later(() => setPhase('reveal'), FADE_AT)
    later(() => onEnter(), ENTER_AT)
  }

  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden ${phase === 'reveal' ? 'splash-fade-out' : ''}`}
    >
      {/* 底下就是首页那片 3D 水面（App 在 view=home 时常驻渲染，启动页正好当展示位），
          这里不再铺黑底，只压一层暗角让白色品牌字在亮部也读得清 */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black/45 via-black/20 to-black/55" />

      {/* 雪花飘落 */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        {flakes.map((f, i) =>
          f.dot ? (
            <span
              key={i}
              className="snowflake-dot"
              style={
                {
                  left: `${f.left}%`,
                  width: f.size,
                  height: f.size,
                  animationDuration: `${f.duration}s`,
                  animationDelay: `${f.delay}s`,
                  '--snow-drift': `${f.drift}px`,
                  '--snow-opacity': f.opacity,
                } as React.CSSProperties
              }
            />
          ) : (
            <span
              key={i}
              className="snowflake"
              style={
                {
                  left: `${f.left}%`,
                  fontSize: f.size,
                  animationDuration: `${f.duration}s`,
                  animationDelay: `${f.delay}s`,
                  '--snow-drift': `${f.drift}px`,
                  '--snow-opacity': f.opacity,
                } as React.CSSProperties
              }
            >
              {f.glyph}
            </span>
          ),
        )}
      </div>

      {/* 右上角伸进来的梅枝。纯装饰：开场页只认「进入」按钮，别处点了不该有反应 */}
      <div className="pointer-events-none absolute -right-2 -top-2 z-[2] text-white/80">
        <BranchSvg on={musicOn} ringing={ringing} detail="rich" strokeScale={0.62} className="h-44 w-44" />
      </div>

      {/* 石头落点荡开的同心水波 */}
      {stone && (
        <div className="splash-stone" style={{ left: stone.x, top: stone.y }}>
          {Array.from({ length: RING_COUNT }, (_, i) => (
            <span
              key={i}
              className="splash-wave-ring"
              style={
                {
                  // 比浪头大一圈：水波要荡出屏幕，而不是刚好停在角上
                  '--wave-d': `${stone.d * 1.25}px`,
                  '--wave-dur': `${RING_DURATION}ms`,
                  animationDelay: `${i * RING_STAGGER}ms`,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      {/* 浪头漫过：铺满后即是首页的底色 */}
      {stone && (
        <span
          className="splash-flood"
          style={
            {
              left: stone.x - stone.d / 2,
              top: stone.y - stone.d / 2,
              width: stone.d,
              height: stone.d,
              '--flood-delay': `${FLOOD_DELAY}ms`,
              '--flood-dur': `${FLOOD_DURATION}ms`,
            } as React.CSSProperties
          }
        />
      )}

      {/* 涟漪 + 图标 */}
      <div className="relative z-[2] flex h-full flex-col items-center justify-center">
        <div className="relative flex h-72 w-72 items-center justify-center">
          <span className="splash-ring" />
          <span className="splash-ring" style={{ animationDelay: '0.9s' }} />
          <span className="splash-ring" style={{ animationDelay: '1.8s' }} />
          <div className="splash-icon relative">
            <IceCreamIcon size={104} color="#ffffff" strokeWidth={2.2} />
          </div>
        </div>

        <h1
          className="mt-8 text-[34px] leading-none tracking-[0.14em] text-white"
          style={{
            fontFamily: '"Songti SC", "Noto Serif SC", "Source Han Serif SC", Cambria, Georgia, serif',
            // 字距会在末字后面留一格，用负右边距抵掉，视觉才真的居中
            marginRight: '-0.14em',
          }}
        >
          scoop words
        </h1>
        <p className="mt-4 text-[12px] tracking-[0.2em] text-white/60" style={{ marginRight: '-0.2em' }}>
          一天一勺，词就记住了
        </p>
        <p className="mt-5 text-[11px] tracking-[0.6em] text-white/35" style={{ marginRight: '-0.6em' }}>
          YYOVO
        </p>

        {/* 唯一的入口：只有这颗按钮能进 */}
        <div className="mt-14 h-16">
          {ready ? (
            <button type="button" onClick={enter} className="splash-enter">
              进 入
              {taps.map((t, i) => (
                <span
                  key={i}
                  className="splash-tap-ring"
                  style={{ left: t.x, top: t.y, animationDelay: `${t.delay}ms` }}
                />
              ))}
            </button>
          ) : (
            <p className="splash-loading text-xs tracking-[0.4em] text-white/45">正在唤醒词库…</p>
          )}
        </div>

        <p className="absolute bottom-10 text-[10px] tracking-[0.3em] text-white/20">今天记住的，明天还在</p>
      </div>
    </div>
  )
}
