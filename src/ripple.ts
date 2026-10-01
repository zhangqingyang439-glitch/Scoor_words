/**
 * 全局点击涟漪：任何 <button> / <a> / [data-ripple] 被按下时，
 * 从指尖落点荡开一圈。用事件委托实现，所以动态渲染出来的按钮也自动生效，
 * 不用去每个组件里包一层。
 */

const HOST_SELECTOR = 'button, a, [data-ripple]'

function coversFully(x: number, y: number, w: number, h: number): number {
  return (
    2 *
    Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y))
  )
}

export function installTapRipple(): void {
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      const host = (e.target as HTMLElement | null)?.closest<HTMLElement>(HOST_SELECTOR)
      if (!host || host.dataset.noRipple !== undefined) return

      const rect = host.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) return

      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const d = coversFully(x, y, rect.width, rect.height)

      // 用行内样式而不是 class：按钮重渲时 React 会把整个 className 写回去，
      // 顺手把我们加的 class 抹掉（切标签页就会踩到），行内样式它不碰。
      // position 只在原本是 static 时补，否则会把 fixed/absolute 的悬浮按钮拽回文档流。
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
      host.style.overflow = 'hidden'

      const span = document.createElement('span')
      span.className = 'app-ripple'
      span.style.left = `${x}px`
      span.style.top = `${y}px`
      span.style.width = `${d}px`
      span.style.height = `${d}px`
      span.addEventListener('animationend', () => span.remove(), { once: true })
      host.appendChild(span)
    },
    { passive: true },
  )
}
