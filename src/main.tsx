import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { registerSW } from 'virtual:pwa-register'
import { applyTheme, readThemeMode } from './theme'
import { installTapRipple } from './ripple'
import { armMusicAutoStart, watchMusicVisibility } from './music'

// 先落主题再渲染，避免首帧闪白（启动页是黑底，闪一下会很显眼）
applyTheme(readThemeMode())
// 全站按钮的点按涟漪（事件委托，动态渲染的按钮也覆盖）
installTapRipple()
// 上次开着音乐的话，等用户第一次点屏幕再启动（浏览器禁止无交互自动播放）
armMusicAutoStart()
// 切后台挂起音频，省电
watchMusicVisibility()

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
