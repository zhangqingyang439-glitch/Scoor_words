import { useCallback, useEffect, useState } from 'react'

/** 外观：跟随系统 / 浅色 / 深色 */
export type ThemeMode = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'xuegao.theme'
/** 浅色页底色，与 index.css 的 --app-bg 保持一致 */
const PAGE_BG = { light: '#f4f4f5', dark: '#0a0a0b' } as const

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function readThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // 隐私模式下 localStorage 可能不可用，退回跟随系统
  }
  return 'system'
}

export function resolveDark(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && systemPrefersDark())
}

/** 把主题落到 <html> 上，并同步地址栏 / 状态栏配色 */
export function applyTheme(mode: ThemeMode): void {
  const dark = resolveDark(mode)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? PAGE_BG.dark : PAGE_BG.light)
}

function persist(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // 存不下就算了，本次会话仍然生效
  }
}

/**
 * 读取并持续同步外观设置。
 * 在 main.tsx 里 render 之前先同步调一次 applyTheme，避免首屏闪白。
 */
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(readThemeMode)

  useEffect(() => {
    applyTheme(mode)
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  const update = useCallback((next: ThemeMode) => {
    persist(next)
    setMode(next)
    applyTheme(next)
  }, [])

  return [mode, update]
}
