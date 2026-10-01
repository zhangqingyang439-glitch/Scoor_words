import { useEffect, useRef, useState, type ComponentType } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, listMyBooks, ensureSeedData, saveSettings } from './db'
import { registerMyBooks } from './books'
import Home from './components/Home'
import WaterScene from './components/water/WaterScene'
import Notebook from './components/Notebook'
import Books from './components/Books'
import SettingsPage from './components/SettingsPage'
import StudyFlow, { type StudySpec } from './components/study/StudyFlow'
import Splash from './components/Splash'
import AmbientRipples from './components/AmbientRipples'
import BranchToggle from './components/BranchToggle'
import { IconHome, IconNotebook, IconBooks, IconSettings } from './components/Icons'
import { setupGlass, teardownGlass } from './glass'

type View = 'home' | 'notebook' | 'books' | 'settings' | 'study'

/** 图标用线描组件，不用 emoji —— emoji 是系统字体画的，各平台长相不一，还是彩色的 */
const TABS: { id: Exclude<View, 'study'>; Icon: ComponentType<{ size?: number }>; label: string }[] = [
  { id: 'home', Icon: IconHome, label: '首页' },
  { id: 'notebook', Icon: IconNotebook, label: '记词本' },
  { id: 'books', Icon: IconBooks, label: '词书' },
  { id: 'settings', Icon: IconSettings, label: '设置' },
]

export default function App() {
  const [view, setView] = useState<View>('home')
  const [studySpec, setStudySpec] = useState<StudySpec>({ kind: 'normal', extra: false })
  const [bookId, setBookId] = useState<string | null | undefined>(undefined)
  const [showSplash, setShowSplash] = useState(true)
  const [focusMusic, setFocusMusic] = useState(false)
  const navRef = useRef<HTMLElement>(null)
  const [glassOn, setGlassOn] = useState(false)

  // 底部导航栏的液态玻璃。位移贴图是按真实像素尺寸算的，
  // 所以转屏 / 缩放窗口之后要重新生成，否则折射会错位
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const apply = () => {
      const r = el.getBoundingClientRect()
      setGlassOn(setupGlass(el, r.width, r.height))
    }
    apply()
    let timer = 0
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(apply, 180)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(timer)
      teardownGlass(el)
    }
  }, [])

  // 把下载到本机的词书挂进 BOOKS，让 study / Home / 记词本那些同步调用也能看到
  const myBooks = useLiveQuery(() => listMyBooks(), [])
  useEffect(() => {
    if (myBooks) registerMyBooks(myBooks)
  }, [myBooks])

  useEffect(() => {
    // 首次运行先把默认单词书建上，再读设置
    ensureSeedData()
      .catch(() => undefined)
      .then(() => getSettings())
      .then((s) => setBookId(s.currentBookId))
  }, [])

  // 长按树枝 → 切到设置页并把音乐区块滚到视野中间
  useEffect(() => {
    if (view !== 'settings' || !focusMusic) return
    const t = window.setTimeout(() => {
      document.getElementById('music-settings')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFocusMusic(false)
    }, 140)
    return () => window.clearTimeout(t)
  }, [view, focusMusic])

  async function pickBook(id: string) {
    const s = await getSettings()
    await saveSettings({ ...s, currentBookId: id })
    setBookId(id)
  }

  function startStudy(spec: StudySpec) {
    setStudySpec(spec)
    setView('study')
  }

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col">
      {/* 首页的全屏水面（3D）：挂在内容层下面，只在首页渲染，切页即卸载 */}
      {view === 'home' && <WaterScene />}
      <AmbientRipples />
      {/* 树枝音乐开关：挂在 App 外壳上，所以每个界面右上角都有。
          单击开/关，长按跳到设置里的音乐区块 */}
      {!showSplash && (
        <BranchToggle
          onOpenSettings={() => {
            setView('settings')
            setFocusMusic(true)
          }}
        />
      )}
      {/* 首页时空白处要把指针让给身后的水面（划过起涟漪），交互卡片各自再开启 pointer-events；
          启动页是透明的（露出水面当展示位），首页内容和导航栏在它期间先隐掉免得穿帮 */}
      <main
        className={`relative z-10 flex-1 px-4 pt-6 pb-28 ${view === 'home' ? 'pointer-events-none' : ''} ${
          showSplash ? 'invisible' : ''
        }`}
      >
        {view === 'home' && (
          <Home onStart={(extra) => startStudy({ kind: 'normal', extra })} onGoBooks={() => setView('books')} />
        )}
        {view === 'notebook' && (
          <Notebook onReview={(wordBookId, selectedIds) => startStudy({ kind: 'notebook', wordBookId, selectedIds })} />
        )}
        {view === 'books' && <Books currentId={bookId ?? null} onPick={pickBook} />}
        {view === 'settings' && <SettingsPage />}
        {view === 'study' && <StudyFlow spec={studySpec} onExit={() => setView('home')} />}
      </main>

      {/* 悬浮胶囊：四条边都离屏边一段距离，透镜折射才看得出来；整条可以按住拖走 */}
      <nav
        ref={navRef}
        data-glass={glassOn ? 'on' : undefined}
        className={`tabbar tabbar-glass fixed inset-x-4 z-20 mx-auto flex max-w-md rounded-full ${
          showSplash ? 'invisible' : ''
        }`}
      >
        {TABS.map((t) => {
          const active = view === t.id || (t.id === 'home' && view === 'study')
          return (
            <button
              key={t.id}
              onClick={() => setView(t.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                active ? 'text-emerald-600' : 'text-zinc-400'
              }`}
            >
              <t.Icon size={22} />
              {t.label}
            </button>
          )
        })}
      </nav>

      {showSplash && <Splash onEnter={() => setShowSplash(false)} />}
    </div>
  )
}
