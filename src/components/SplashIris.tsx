import { useEffect, useRef } from 'react'

/**
 * 开场收球：点「进入」后浪头漫过全屏（Splash 里的黑色大圆），首页在底下就位；
 * 这层再把这个铺满的圆从全屏**慢慢收回来**，最后收进首页主按钮
 * （「先选一本词书 / 开始学习」）的位置消失。
 *
 * 颜色取 var(--app-bg)，跟 Splash 浪头（splash-flood）完全同色 ——
 * 浪头铺满的最后一帧和这层的起始帧无缝衔接，看不到切换点。
 *
 * 实现：clip-path: circle(r at x y) 从盖住全屏收到 0，圆心由 #home-cta
 * 的实际位置测出来；WAAPI 动画结束再卸载。尊重系统的「减弱动态效果」
 * 设置：开了就直接跳过，不演。
 */
export default function SplashIris({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      doneRef.current()
      return
    }

    const vw = window.innerWidth
    const vh = window.innerHeight
    // 收球落点：首页主按钮的中心；万一找不到就退到屏幕中心
    const btn = document.getElementById('home-cta')
    const r = btn?.getBoundingClientRect()
    const x = r ? r.left + r.width / 2 : vw / 2
    const y = r ? r.top + r.height / 2 : vh / 2
    // 起始半径：从落点出发恰好盖住全屏的四角距离取最大
    const R =
      Math.max(Math.hypot(x, y), Math.hypot(vw - x, y), Math.hypot(x, vh - y), Math.hypot(vw - x, vh - y)) + 2

    let cancelled = false
    // 浪头铺满后先停半拍（黑屏定格），再开始收 —— 直接连着收会显得赶
    const hold = window.setTimeout(() => {
      if (cancelled || !el.isConnected) return
      const anim = el.animate(
        [
          { clipPath: `circle(${R}px at ${x}px ${y}px)` },
          { clipPath: `circle(0px at ${x}px ${y}px)` },
        ],
        // 先慢后慢中间快：看得清「收回」的过程，结尾也不是戛然而止
        { duration: 1400, easing: 'cubic-bezier(0.55, 0, 0.35, 1)', fill: 'forwards' },
      )
      anim.finished
        .then(() => {
          if (!cancelled) doneRef.current()
        })
        .catch(() => {
          // 动画被打断（组件卸载）就算了，App 那边已经收尾
        })
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(hold)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100]"
      style={{
        background: 'var(--app-bg)',
        // 挂载瞬间先盖满全屏（等 JS 测完落点再开始收）
        clipPath: 'circle(200vmax at 50% 50%)',
        // drop-shadow 跟着 clip 后的轮廓走 —— 收缩的边缘带一道柔光，
        // 和浪头那圈白边呼应，黑球在黑底上才看得见边界
        filter: 'drop-shadow(0 0 22px rgba(255,255,255,0.16))',
      }}
    />
  )
}
