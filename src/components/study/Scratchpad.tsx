import { useEffect, useRef, useState } from 'react'

/** 笔迹颜色必须跟着主题走：深色画布上再用近黑墨就什么都看不见了 */
function inkColor(): string {
  return document.documentElement.classList.contains('dark') ? '#f4f4f5' : '#18181b'
}

/** 草稿板：背单词时手写/打字加深记忆 */
export default function Scratchpad({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [eraser, setEraser] = useState(false)
  const [mode, setMode] = useState<'draw' | 'type'>('draw')
  const [text, setText] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.clientWidth
    const H = canvas.clientHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 3
    ctx.strokeStyle = inkColor()
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = pos(e)
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const p = pos(e)
    ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over'
    ctx.lineWidth = eraser ? 18 : 3
    ctx.strokeStyle = inkColor()
    ctx.beginPath()
    ctx.moveTo(last.current!.x, last.current!.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    last.current = p
  }

  function end() {
    drawing.current = false
    last.current = null
  }

  function clear() {
    if (mode === 'type') {
      setText('')
      return
    }
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex w-[320px] items-center justify-between">
          <span className="text-sm font-medium text-white/90">✏️ 草稿板</span>
          <div className="flex gap-2">
            <button
              onClick={() => setMode(mode === 'draw' ? 'type' : 'draw')}
              className="rounded-lg bg-card/90 px-3 py-1.5 text-xs text-zinc-600"
            >
              {mode === 'draw' ? '改打字' : '改手写'}
            </button>
            {mode === 'draw' && (
              <button
                onClick={() => setEraser((v) => !v)}
                className={`rounded-lg px-3 py-1.5 text-xs ${eraser ? 'bg-brand text-white' : 'bg-card/90 text-zinc-600'}`}
              >
                {eraser ? '橡皮中' : '橡皮'}
              </button>
            )}
            <button onClick={clear} className="rounded-lg bg-card/90 px-3 py-1.5 text-xs text-zinc-600">
              清空
            </button>
            <button onClick={onClose} className="rounded-lg bg-inverse px-3 py-1.5 text-xs text-inverse-ink">
              关闭
            </button>
          </div>
        </div>
        {/* 手写画布：保持挂载，切模式时隐藏以保留笔迹 */}
        <canvas
          ref={canvasRef}
          className={`h-[420px] w-[320px] touch-none rounded-2xl bg-card shadow-xl ${mode === 'draw' ? '' : 'hidden'}`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
        />
        {mode === 'type' && (
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="把单词、词根、例句…随便打点什么"
            className="h-[420px] w-[320px] rounded-2xl bg-card p-4 text-base shadow-xl focus:outline-none"
          />
        )}
        <p className="text-xs text-white/60">{mode === 'draw' ? '用手写一写，记得更牢' : '打打字，整理一下思路'}</p>
      </div>
    </div>
  )
}
