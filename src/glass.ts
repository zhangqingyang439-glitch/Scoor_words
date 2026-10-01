/**
 * 底部导航栏的液态玻璃 —— 按 Shu Ding 的 liquid-glass 重构
 * （github.com/shuding/liquid-glass，2025，Vanilla JS 版）。
 *
 * 原理和原版完全一致：
 *   在 canvas 上逐像素跑 fragment，算出每个像素「该去背后的哪里采样」，
 *   位移量编进 R/G 通道（128 = 不动）得到一张位移贴图；
 *   贴图喂给 SVG 的 feImage → feDisplacementMap，再挂 backdrop-filter: url(#id)，
 *   让导航栏**背后的内容**发生透镜折射。
 *   fragment 就是原版那组公式（roundedRectSDF 距离场 + 两段 smoothStep），
 *   参数也原样照搬：中心不动，越靠边弯得越狠，圆角处最猛 —— 这才是液态玻璃。
 *
 * 为适配导航栏只改了三件事：
 *   1. demo 是写死 300×200 的浮层玻璃，这里按导航栏真实尺寸生成贴图；
 *      贴图按像素算，转屏 / 缩放窗口后要重建，否则折射错位。
 *   2. demo 整块玻璃随便拖；导航栏上有四个页签，按住就拖会跟点击打架 ——
 *      加 6px 阈值：原地松手是点按（正常切页），拖出阈值才算拖；
 *      拖动范围钳制在视口内（同 demo 的 constrainPosition，边距 10px）。
 *   3. 滤镜显式锁 sRGB：Chrome 滤镜默认 linearRGB，会把贴图里的
 *      128 灰阶解释成位移，整个折射会歪。
 *
 * 兼容性：backdrop-filter: url() 只有 Chromium 系支持，Safari / Firefox 会把
 * 整条声明作废 —— CSS 里另写了普通 blur 兜底（.tabbar-glass），这里探不到就不挂折射；
 * 拖动不依赖滤镜，任何浏览器都能拖。
 */

const FILTER_ID = 'liquid-glass-tabbar'
const MAP_ID = 'liquid-glass-tabbar-map'

/** 原版的调法：blur 只给一点点 —— 折射本身已经在"压"画面，再糊就成毛玻璃了 */
const GLASS_VALUE =
  `url(#${FILTER_ID}) blur(0.25px) contrast(1.2) brightness(1.05) saturate(1.1)`

/** 位移不超过这个数不算拖，松手仍是点按 */
const DRAG_THRESHOLD = 6
/** 拖动时离视口边的最小留白，同 demo 的 offset */
const VIEWPORT_MARGIN = 10

function smoothStep(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function length(x: number, y: number): number {
  return Math.sqrt(x * x + y * y)
}

function roundedRectSDF(x: number, y: number, width: number, height: number, radius: number): number {
  const qx = Math.abs(x) - width + radius
  const qy = Math.abs(y) - height + radius
  return Math.min(Math.max(qx, qy), 0) + length(Math.max(qx, 0), Math.max(qy, 0)) - radius
}

/** 原版 demo 的 fragment（参数原样）：uv → 该像素去背后采样哪里 */
function refract(uv: { x: number; y: number }): { x: number; y: number } {
  const ix = uv.x - 0.5
  const iy = uv.y - 0.5
  const distanceToEdge = roundedRectSDF(ix, iy, 0.3, 0.2, 0.6)
  const displacement = smoothStep(0.8, 0, distanceToEdge - 0.15)
  const scaled = smoothStep(0, 1, displacement)
  return { x: ix * scaled + 0.5, y: iy * scaled + 0.5 }
}

/** 生成位移贴图。返回 data URI 和位移强度（px） */
function buildMap(w: number, h: number): { href: string; scale: number } | null {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const data = new Uint8ClampedArray(w * h * 4)
  const raw = new Float32Array(w * h * 2)
  let maxScale = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pos = refract({ x: x / w, y: y / h })
      const dx = pos.x * w - x
      const dy = pos.y * h - y
      maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy))
      const o = (y * w + x) * 2
      raw[o] = dx
      raw[o + 1] = dy
    }
  }
  if (maxScale === 0) maxScale = 1

  // 归一化同原版（maxScale 折半）：超出范围的位移被钳到 0/255，
  // 等于给最外圈的折射封了顶 —— 原版那个观感就是这么来的
  maxScale *= 0.5
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = (raw[i * 2] / maxScale) * 127.5 + 127.5
    data[i * 4 + 1] = (raw[i * 2 + 1] / maxScale) * 127.5 + 127.5
    data[i * 4 + 2] = 0
    data[i * 4 + 3] = 255
  }

  ctx.putImageData(new ImageData(data, w, h), 0, 0)
  return { href: canvas.toDataURL(), scale: maxScale }
}

/** 支持 url() 形式的 backdrop-filter 吗（只有 Chromium 系） */
function supportsGlass(): boolean {
  if (typeof CSS === 'undefined' || !CSS.supports) return false
  return CSS.supports('backdrop-filter', `url(#${FILTER_ID})`)
}

/* ---------------- 拖动 ---------------- */

const dragWired = new WeakSet<HTMLElement>()
let resizeHandler: (() => void) | null = null

/** 钳在视口内，同 demo 的 constrainPosition */
function constrainToViewport(el: HTMLElement, x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(VIEWPORT_MARGIN, x), window.innerWidth - el.offsetWidth - VIEWPORT_MARGIN),
    y: Math.min(Math.max(VIEWPORT_MARGIN, y), window.innerHeight - el.offsetHeight - VIEWPORT_MARGIN),
  }
}

/**
 * 给导航栏装上 demo 那种「按住拖着走」。
 * 和 demo 的区别只在 6px 阈值：导航栏上有四个页签按钮，
 * 得先分清是点按还是拖动 —— 没拖出阈值就松手，click 照常落在按钮上。
 */
function enableDragging(el: HTMLElement): void {
  if (!dragWired.has(el)) {
    dragWired.add(el)

    let pressing = false // 按着，但还分不清是点按还是拖
    let dragging = false
    let swallowClick = false
    let startX = 0
    let startY = 0
    let originX = 0
    let originY = 0

    // 第一次真正拖起来时，把「贴边居中」换成自由定位
    const freePosition = () => {
      const r = el.getBoundingClientRect()
      el.style.width = `${r.width}px`
      el.style.left = `${r.left}px`
      el.style.top = `${r.top}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      el.style.marginLeft = '0' // mx-auto 靠的是 auto 外边距，得一并清掉
      el.style.marginRight = '0'
    }

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pressing = true
      dragging = false
      startX = e.clientX
      startY = e.clientY
      const r = el.getBoundingClientRect()
      originX = r.left
      originY = r.top
    })

    // move / up 挂在 document 上：按住之后手一快，第一个 move 就可能
    // 已经扫出导航栏，只听导航栏自己会丢事件（demo 也是这么干的）
    document.addEventListener('pointermove', (e) => {
      if (!pressing) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        dragging = true
        freePosition()
        el.setPointerCapture(e.pointerId) // 拖出导航栏也继续收事件
        el.classList.add('dragging')
      }
      const p = constrainToViewport(el, originX + dx, originY + dy)
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
    })

    const release = () => {
      if (!pressing) return
      pressing = false
      swallowClick = dragging
      dragging = false
      el.classList.remove('dragging')
    }
    document.addEventListener('pointerup', release)
    document.addEventListener('pointercancel', release)

    // 拖完收尾的那次 click 是拖动的一部分，不是点按 —— 吃掉，免得误切页签
    el.addEventListener(
      'click',
      (e) => {
        if (!swallowClick) return
        swallowClick = false
        e.preventDefault()
        e.stopPropagation()
      },
      true,
    )
  }

  // 窗口缩放后玻璃可能悬到视口外，推回来（同 demo 的 resize 处理）。
  // teardown 时要摘掉，所以放 WeakSet 外面每次重挂
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  resizeHandler = () => {
    if (!el.style.left) return
    const r = el.getBoundingClientRect()
    const p = constrainToViewport(el, r.left, r.top)
    el.style.left = `${p.x}px`
    el.style.top = `${p.y}px`
  }
  window.addEventListener('resize', resizeHandler)
}

/* ---------------- 滤镜 ---------------- */

let mounted: SVGSVGElement | null = null
let lastKey = ''

function buildFilterSvg(w: number, h: number, map: { href: string; scale: number }): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg'

  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:absolute;pointer-events:none'

  const defs = document.createElementNS(NS, 'defs')
  const filter = document.createElementNS(NS, 'filter')
  filter.setAttribute('id', FILTER_ID)
  filter.setAttribute('filterUnits', 'userSpaceOnUse')
  filter.setAttribute('x', '0')
  filter.setAttribute('y', '0')
  filter.setAttribute('width', String(w))
  filter.setAttribute('height', String(h))
  // Chrome 滤镜默认 linearRGB：不显式锁 sRGB，贴图里的 128 灰阶会被
  // 解释成位移，整个折射歪掉。CSS 属性和展示属性各设一遍，双保险
  filter.setAttribute('color-interpolation-filters', 'sRGB')
  filter.style.colorInterpolationFilters = 'sRGB'

  const img = document.createElementNS(NS, 'feImage')
  img.setAttribute('id', MAP_ID)
  img.setAttribute('width', String(w))
  img.setAttribute('height', String(h))
  img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', map.href)

  const disp = document.createElementNS(NS, 'feDisplacementMap')
  disp.setAttribute('in', 'SourceGraphic')
  disp.setAttribute('in2', MAP_ID)
  disp.setAttribute('xChannelSelector', 'R')
  disp.setAttribute('yChannelSelector', 'G')
  disp.setAttribute('scale', String(map.scale))

  filter.appendChild(img)
  filter.appendChild(disp)
  defs.appendChild(filter)
  svg.appendChild(defs)
  return svg
}

/**
 * 按导航栏的真实尺寸建好滤镜，并**用行内样式**把折射挂上去。
 *
 * 为什么不用 CSS 类：Tailwind v4 走 Lightning CSS，实测它会把 CSS 文件里
 * 手写的 `backdrop-filter` 和 `-webkit-backdrop-filter` 合并成只留 `-webkit-` 那条，
 * 而不带前缀的那条在当前 Chrome 里才是生效的 —— 折射就完全上不去了。
 * 行内样式不过构建管道，`el.style.backdropFilter = 'url(#id) ...'` 计算值正常。
 *
 * 尺寸变了（转屏、窗口缩放）会重建 —— 贴图是按像素算的，尺寸不对折射就错位。
 */
export function setupGlass(el: HTMLElement, width: number, height: number): boolean {
  enableDragging(el) // 拖动不依赖滤镜，Safari 上也能拖，只是没有折射
  if (!supportsGlass() || width < 2 || height < 2) return false

  const w = Math.round(width)
  const h = Math.round(height)
  const key = `${w}x${h}`
  if (key === lastKey && mounted?.isConnected) {
    el.style.backdropFilter = GLASS_VALUE
    return true
  }

  const map = buildMap(w, h)
  if (!map) return false

  mounted?.remove()
  mounted = buildFilterSvg(w, h, map)
  document.body.appendChild(mounted)
  lastKey = key

  el.setAttribute('data-glass', 'on')
  el.style.backdropFilter = GLASS_VALUE
  return true
}

export function teardownGlass(el?: HTMLElement | null): void {
  mounted?.remove()
  mounted = null
  lastKey = ''
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler)
    resizeHandler = null
  }
  if (el) {
    el.style.backdropFilter = ''
    el.removeAttribute('data-glass')
  }
}
