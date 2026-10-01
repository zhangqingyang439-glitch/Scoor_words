import { useEffect, useRef, useState } from 'react'
import { music } from '../music'
import { BranchSvg } from './BranchSvg'

/** 按住多久算长按 */
const LONG_PRESS_MS = 480

/**
 * 右上角的「冬天的树枝」音乐开关。
 *
 * 关着的时候：一根光秃的枝子，侧枝只抽出一小截，梢上是收得紧紧的花苞。
 * 点一下：侧枝抽长、花苞绽开、整根枝子开始慢慢摆，音乐同时淡入。
 * 每响一个音符，就有一朵花轻轻亮一下 —— 声音和画面长在同一根枝子上。
 * 长按：跳到设置里的音乐区块，调音量和音色。
 *
 * 视觉上一律用 currentColor 走 ink 色阶，不加彩色，和整套「墨白」是一路的；
 * 开/关靠形状区分，不靠颜色。
 */
export default function BranchToggle({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [on, setOn] = useState(() => music.isEnabled())
  const [ringing, setRinging] = useState(-1)
  const ringTimer = useRef<number | null>(null)
  const pressTimer = useRef<number | null>(null)
  const longPressed = useRef(false)

  useEffect(() => music.onStateChange(() => setOn(music.isEnabled())), [])

  // 每个音符随机点亮一朵花
  useEffect(
    () =>
      music.onNote(() => {
        setRinging(Math.floor(Math.random() * 3))
        if (ringTimer.current !== null) window.clearTimeout(ringTimer.current)
        ringTimer.current = window.setTimeout(() => setRinging(-1), 760)
      }),
    [],
  )

  useEffect(
    () => () => {
      if (ringTimer.current !== null) window.clearTimeout(ringTimer.current)
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
    },
    [],
  )

  function clearPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        // 长按已经跳去设置了，这次 click 不要再切开关
        if (longPressed.current) {
          longPressed.current = false
          return
        }
        music.toggle()
      }}
      onPointerDown={() => {
        longPressed.current = false
        clearPress()
        pressTimer.current = window.setTimeout(() => {
          longPressed.current = true
          onOpenSettings()
        }, LONG_PRESS_MS)
      }}
      onPointerUp={clearPress}
      onPointerLeave={clearPress}
      onPointerCancel={clearPress}
      onContextMenu={(e) => e.preventDefault()}
      aria-pressed={on}
      aria-label={`背景音乐：${on ? '开' : '关'}。点一下切换，长按进入音乐设置`}
      title={`背景音乐：${on ? '开' : '关'}（长按进入设置）`}
      data-no-ripple="1"
      className={`branch-toggle absolute right-2.5 top-2.5 z-30 flex h-12 w-12 items-center justify-center ${
        on ? 'is-on text-zinc-800' : 'text-zinc-500'
      }`}
    >
      <BranchSvg on={on} ringing={ringing} detail="simple" className="h-10 w-10" />
    </button>
  )
}
