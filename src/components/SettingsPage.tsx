import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, listWordBooks, saveSettings, todayKey } from '../db'
import { useThemeMode, type ThemeMode } from '../theme'
import { music, PRESETS } from '../music'
import { BranchSvg, PlumBlossom } from './BranchSvg'

const THEME_OPTIONS: { id: ThemeMode; label: string }[] = [
  { id: 'system', label: '跟随系统' },
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
]

export default function SettingsPage() {
  const books = useLiveQuery(() => listWordBooks(), [])
  const [collectBookId, setCollectBookId] = useState<string | null | undefined>(undefined)
  const [themeMode, setThemeMode] = useThemeMode()
  const [musicOn, setMusicOn] = useState(() => music.isEnabled())
  const [volume, setVolume] = useState(() => music.getVolume())
  const [presetId, setPresetId] = useState(() => music.getPresetId())

  // 引擎那边任何变化（开关/音量/音色）都同步过来
  useEffect(
    () =>
      music.onStateChange(() => {
        setMusicOn(music.isEnabled())
        setVolume(music.getVolume())
        setPresetId(music.getPresetId())
      }),
    [],
  )

  /** 选音色时如果音乐是关的，顺手打开 —— 不然点了没声音，不知道选中没有 */
  function choosePreset(id: string) {
    music.setPreset(id)
    if (!music.isEnabled()) void music.enable()
  }

  useEffect(() => {
    getSettings().then((s) => setCollectBookId(s.collectBookId ?? null))
  }, [])

  async function setDefaultBook(id: string) {
    const s = await getSettings()
    await saveSettings({ ...s, collectBookId: id })
    setCollectBookId(id)
  }

  async function exportData() {
    const [progress, stats, settings, plans] = await Promise.all([
      db.progress.toArray(),
      db.stats.toArray(),
      db.settings.toArray(),
      db.plans.toArray(),
    ])
    const data = { version: 2, exportedAt: new Date().toISOString(), progress, stats, settings, plans }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scoop-backup-${todayKey()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text())
      if (!data || !Array.isArray(data.progress)) throw new Error('文件格式不正确')
      await db.transaction('rw', [db.progress, db.stats, db.settings, db.plans], async () => {
        await db.progress.bulkPut(data.progress)
        if (Array.isArray(data.stats)) await db.stats.bulkPut(data.stats)
        if (Array.isArray(data.settings)) await db.settings.bulkPut(data.settings)
        if (Array.isArray(data.plans)) await db.plans.bulkPut(data.plans)
      })
      alert(`已导入 ${data.progress.length} 条学习记录`)
      location.reload()
    } catch (e) {
      alert(`导入失败：${e instanceof Error ? e.message : e}`)
    }
  }

  async function clearAll() {
    if (!confirm('确定清空所有学习记录和收藏吗？此操作不可恢复，建议先导出备份。')) return
    await db.progress.clear()
    await db.stats.clear()
    alert('已清空')
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">设置</h1>

      <div className="rounded-2xl bg-card p-5 shadow-sm">
        <div className="font-medium">外观</div>
        <p className="mt-1 text-xs text-zinc-400">深色是纯黑底，浅色是纸白底，两套都是同一份布局</p>
        <div className="mt-3 flex gap-1 rounded-xl bg-segment-track p-1">
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setThemeMode(o.id)}
              aria-pressed={themeMode === o.id}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                themeMode === o.id ? 'bg-segment text-zinc-900 shadow-sm' : 'text-zinc-500'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-card p-5 shadow-sm">
        <div className="font-medium">收藏默认单词书</div>
        <p className="mt-1 text-xs text-zinc-400">学习时点 ✓ 直接收藏进这本书，不再弹窗询问</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(books ?? []).map((b) => (
            <button
              key={b.id}
              onClick={() => setDefaultBook(b.id)}
              className={`rounded-full px-3 py-1.5 text-xs ${
                collectBookId === b.id ? 'bg-brand text-white' : 'bg-zinc-100 text-zinc-600'
              }`}
            >
              {b.name}
            </button>
          ))}
          {books !== undefined && (books?.length ?? 0) === 0 && (
            <p className="text-xs text-zinc-400">还没有单词书，去记词本新建一本</p>
          )}
        </div>
      </div>

      {/* 右上角那根树枝长按会滚到这里 */}
      <div id="music-settings" className="rounded-2xl bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">背景音乐</div>
            <p className="mt-1 text-xs text-zinc-400">现场合成，不占体积、不联网也能响</p>
          </div>
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden="true">
            <BranchSvg on={musicOn} detail="simple" className={`h-8 w-8 ${musicOn ? 'text-zinc-800' : 'text-zinc-500'}`} />
          </span>
        </div>

        <button
          onClick={() => music.toggle()}
          aria-pressed={musicOn}
          className="mt-3 flex w-full items-center justify-between rounded-xl bg-zinc-100 px-4 py-3 active:bg-zinc-200"
        >
          <span className="text-sm">{musicOn ? '已开启' : '已关闭'}</span>
          {/* 开关。旋钮必须写死 left，不能靠 translate 从"静态位置"挪 ——
              静态位置是浏览器算出来的，实测是 20px，再挪 2px 就顶出轨道 2px 了。
              shrink-0 也是必须的：它是 flex 子项，不写死宽度会被压窄。 */}
          <span
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
              musicOn ? 'bg-inverse' : 'bg-zinc-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-[left] duration-200 ${
                musicOn ? 'left-[18px]' : 'left-0.5'
              }`}
            />
          </span>
        </button>

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-zinc-400">音量</span>
            <span className="text-xs tabular-nums text-zinc-500">{volume}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => music.setVolume(Number(e.target.value))}
            className="music-range mt-2 w-full"
            aria-label="背景音乐音量"
          />
        </div>

        {/* 一朵花一种音色：没选的是花苞，选中的那朵开。
            用花苞而不是色块/单选按钮 —— 跟词书页、记词本页是同一套语言 */}
        <div className="mt-5">
          <div className="text-xs text-zinc-400">音色</div>
          <div className="mt-3 grid grid-cols-4 gap-x-1 gap-y-4">
            {PRESETS.map((p) => {
              const on = presetId === p.id
              return (
                <button
                  key={p.id}
                  onClick={() => choosePreset(p.id)}
                  aria-pressed={on}
                  className="flex flex-col items-center gap-2"
                >
                  <PlumBlossom size={52} open={on} full={on} className={on ? 'text-zinc-800' : 'text-zinc-500'} />
                  <span className={`text-[11px] leading-none ${on ? 'font-semibold text-zinc-900' : 'text-zinc-500'}`}>
                    {p.name}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-center text-[11px] text-zinc-400">
            {PRESETS.find((p) => p.id === presetId)?.hint}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-card p-5 shadow-sm">
        <div className="font-medium">数据备份</div>
        <p className="mt-1 text-xs text-zinc-400">
          学习进度只存在本机浏览器里，建议定期导出备份文件
        </p>
        <div className="mt-3 flex gap-3">
          <button
            onClick={exportData}
            className="flex-1 rounded-xl bg-inverse py-2.5 text-sm font-medium text-inverse-ink active:bg-inverse/85"
          >
            导出进度
          </button>
          <label className="flex-1 cursor-pointer rounded-xl bg-zinc-100 py-2.5 text-center text-sm font-medium active:bg-zinc-200">
            导入进度
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importData(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      <button
        onClick={clearAll}
        className="rounded-2xl bg-card p-5 text-left font-medium text-red-500 shadow-sm"
      >
        清空学习记录
      </button>

      <div className="rounded-2xl bg-card p-5 text-xs leading-relaxed text-zinc-500 shadow-sm">
        <div className="mb-1 font-medium text-zinc-700">关于</div>
        scoop words v0.3 · 四遍通关学习法（极速记忆 → 看词填义 → 看义默写 →
        例句翻译）· 错词当场重现 · 复习按错误率安排 · 存储 IndexedDB。
        首次联网打开后应用会被完整缓存，之后断网也能使用；建议「添加到主屏幕」当作独立应用运行。
        <div className="mt-3 border-t border-zinc-100 pt-3">
          制作人：<span className="font-medium text-zinc-700">YYovo</span>
          <br />
          联系邮箱：
          <a href="mailto:2529138387@qq.com" className="text-emerald-600 underline">
            2529138387@qq.com
          </a>
        </div>
      </div>
    </div>
  )
}
