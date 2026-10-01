import { useEffect, useRef } from 'react'

/* 背景水波的时间参数 */
const AMBIENT_EVERY_MS = 2800
const AMBIENT_DUR_MS = 7200
const TAP_DUR_MS = 1900

/* 重点按钮（带 data-ripple-wave）：和开场那颗石子同一套动作，三圈错开荡开 */
const WAVE_RINGS = 3
const WAVE_STAGGER_MS = 190
const WAVE_DUR_MS = 2100

const MAX_RINGS = 10

interface RingOpts {
  /** 直径 */
  size: number
  dur: number
  /** 相对主题上限的倍数：1 = 背景默认强度，重点按钮给 2 以上 */
  alpha: number
  /** 描边起始 / 结束宽度（px，写在元素自身坐标系里，会跟着 scale 缩放） */
  w0?: number
  w1?: number
  delay?: number
}

/**
 * 全屏背景水波层。
 * · 静置时每隔几秒随机荡开一圈
 * · 普通点按从指尖送一圈
 * · 带 data-ripple-wave 的重点按钮（开始学习 / 搜索 / 单词书封面）
 *   按下时荡出三圈同心水波，和开场页那颗石子是一个动作
 * 用命令式 DOM 直接增删节点，避免每圈涟漪都触发一次 React 渲染。
 */
export default function AmbientRipples() {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let alive = true
    const live = new Set<HTMLElement>()
    const pending = new Set<number>()

    const ring = (x: number, y: number, opts: RingOpts) => {
      const run = () => {
        pending.delete(timer)
        if (!alive) return
        // 超上限就先把最老的一圈收掉，别让 DOM 无限涨
        while (live.size >= MAX_RINGS) {
          const oldest = live.values().next().value
          if (!oldest) break
          oldest.remove()
          live.delete(oldest)
        }
        const el = document.createElement('span')
        el.className = 'ambient-ring'
        el.style.left = `${x}px`
        el.style.top = `${y}px`
        el.style.width = `${opts.size}px`
        el.style.height = `${opts.size}px`
        el.style.setProperty('--ring-dur', `${opts.dur}ms`)
        el.style.setProperty('--ring-alpha', String(opts.alpha))
        el.style.setProperty('--ring-w0', `${opts.w0 ?? 2}px`)
        el.style.setProperty('--ring-w1', `${opts.w1 ?? 2}px`)
        host.appendChild(el)
        live.add(el)
        el.addEventListener(
          'animationend',
          () => {
            el.remove()
            live.delete(el)
          },
          { once: true },
        )
      }
      const timer = window.setTimeout(run, opts.delay ?? 0)
      pending.add(timer)
    }

    /** 屏幕对角线：水波要荡得出屏幕 */
    const span = () => Math.hypot(window.innerWidth, window.innerHeight)

    // 开局先荡两圈，别让页面一开始空着
    ring(window.innerWidth * 0.5, window.innerHeight * 0.32, { size: span() * 1.05, dur: 6400, alpha: 0.9 })
    ring(window.innerWidth * 0.28, window.innerHeight * 0.68, {
      size: span() * 1.05,
      dur: 7200,
      alpha: 0.8,
      delay: 900,
    })

    const timer = window.setInterval(() => {
      ring(Math.random() * window.innerWidth, Math.random() * window.innerHeight, {
        size: span() * 1.05,
        dur: AMBIENT_DUR_MS,
        alpha: 1,
      })
    }, AMBIENT_EVERY_MS)

    const onDown = (e: PointerEvent) => {
      const waveHost = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-ripple-wave]')
      if (waveHost) {
        for (let i = 0; i < WAVE_RINGS; i++) {
          ring(e.clientX, e.clientY, {
            size: span() * 1.5,
            dur: WAVE_DUR_MS,
            alpha: 2.4,
            w0: 8, // 起手粗，越荡越细
            w1: 1.5,
            delay: i * WAVE_STAGGER_MS,
          })
        }
        return
      }
      ring(e.clientX, e.clientY, { size: span() * 1.25, dur: TAP_DUR_MS, alpha: 1.8 })
    }
    window.addEventListener('pointerdown', onDown, { passive: true })

    return () => {
      alive = false
      window.clearInterval(timer)
      pending.forEach((t) => window.clearTimeout(t))
      pending.clear()
      window.removeEventListener('pointerdown', onDown)
      host.replaceChildren()
    }
  }, [])

  return <div ref={hostRef} className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true" />
}
