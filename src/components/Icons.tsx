/**
 * 导航栏图标。
 *
 * 原来用的是 emoji（🏠📖📚⚙️），问题有三个：
 *  · emoji 是系统字体画的，安卓／苹果／Windows 上长得都不一样
 *  · 全是彩色卡通，跟整套墨白线描不是一套语言
 *  · 没法跟着主题变色
 *
 * 现在统一成：24 视口、1.7 描边、currentColor —— 浅色下深灰、深色下浅灰，
 * 当前页由父级给 emerald 色。
 */

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

/** 首页 —— 日历（首页主打的是「今日新词」，不是「家」） */
export function IconHome({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <rect x="3.6" y="5.2" width="16.8" height="15.2" rx="2.2" />
      <path d="M3.6 9.8h16.8" />
      <path d="M8.2 3.4v3.4" />
      <path d="M15.8 3.4v3.4" />
      <circle cx="12" cy="14.8" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 记词本 —— 笔记本 */
export function IconNotebook({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <rect x="5.4" y="3.8" width="13.2" height="16.4" rx="2.2" />
      <path d="M9 3.8v16.4" />
      <path d="M11.6 8.6h4.4" />
      <path d="M11.6 12.4h4.4" />
    </svg>
  )
}

/** 词书 —— 梅花（这一页现在就是一棵梅树，用花作标记最自洽） */
export function IconBooks({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <g transform="translate(12 12)">
        <g strokeWidth="1.45">
          <circle cx="0" cy="-5.6" r="4.5" />
          <circle cx="5.3" cy="-1.7" r="4.5" />
          <circle cx="3.3" cy="4.6" r="4.5" />
          <circle cx="-3.3" cy="4.6" r="4.5" />
          <circle cx="-5.3" cy="-1.7" r="4.5" />
        </g>
        <g strokeWidth="0.9">
          <line x1="0" y1="0" x2="0" y2="-6.6" />
          <line x1="0" y1="0" x2="6.3" y2="-2.1" />
          <line x1="0" y1="0" x2="3.9" y2="5.4" />
          <line x1="0" y1="0" x2="-3.9" y2="5.4" />
          <line x1="0" y1="0" x2="-6.3" y2="-2.1" />
        </g>
        <circle r="2.5" fill="currentColor" stroke="none" />
      </g>
    </svg>
  )
}

/** 设置 —— 三滑杆。齿轮这个形状太容易做土，滑杆干净得多，
    而且和设置页里那个真的音量滑块是同一个东西 */
export function IconSettings({ size = 22 }: { size?: number }) {
  return (
    <svg {...svgProps} width={size} height={size}>
      <path d="M3.8 6.6h3.4" />
      <path d="M12.2 6.6h8" />
      <circle cx="9.7" cy="6.6" r="2.1" />
      <path d="M3.8 12h8" />
      <path d="M16.8 12h3.4" />
      <circle cx="14.3" cy="12" r="2.1" />
      <path d="M3.8 17.4h3.4" />
      <path d="M12.2 17.4h8" />
      <circle cx="9.7" cy="17.4" r="2.1" />
    </svg>
  )
}
