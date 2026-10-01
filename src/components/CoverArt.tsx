import type { ReactNode } from 'react'

/**
 * 封面上的黑白线描。
 * 只描边、不填色，压在半透明白色上，摆在右下角并故意出血到圆角外，
 * 让整块渐变色看起来是"设计过的"而不是一块纯色。
 */
const MOTIFS: ReactNode[] = [
  // 1 冰淇淋（对应 scoop words 这个牌子）
  <g key="ice">
    <path d="M36 46 L64 46 L50 84 Z" />
    <path d="M43 57 L57 57" />
    <path d="M46 67 L54 67" />
    <circle cx="50" cy="36" r="14" />
    <circle cx="39" cy="21" r="9" />
    <circle cx="61" cy="21" r="9" />
  </g>,
  // 2 摊开的书
  <g key="book">
    <path d="M50 34 C42 26 30 24 18 26 L18 76 C30 74 42 76 50 84 C58 76 70 74 82 76 L82 26 C70 24 58 26 50 34 Z" />
    <path d="M50 34 L50 84" />
    <path d="M27 41 C33 41 39 42 44 45" />
    <path d="M56 45 C61 42 67 41 73 41" />
  </g>,
  // 3 山与日
  <g key="peak">
    <circle cx="71" cy="29" r="11" />
    <path d="M8 82 L36 38 L54 66 L66 50 L92 82 Z" />
    <path d="M28 50 L36 38 L44 50" />
  </g>,
  // 4 枝叶
  <g key="leaf">
    <path d="M50 90 C50 66 50 44 50 18" />
    <path d="M50 62 C38 60 27 52 25 37 C40 37 48 47 50 62 Z" />
    <path d="M50 44 C62 42 73 32 75 17 C60 17 52 29 50 44 Z" />
  </g>,
  // 5 星月
  <g key="moon">
    <path d="M65 18 A27 27 0 1 0 65 74 A21 21 0 1 1 65 18 Z" />
    <path d="M30 30 L33.4 39 L42.4 42.4 L33.4 45.8 L30 54.8 L26.6 45.8 L17.6 42.4 L26.6 39 Z" />
  </g>,
  // 6 沙漏
  <g key="hour">
    <path d="M31 19 L69 19 M31 83 L69 83" />
    <path d="M36 19 C36 40 50 46 50 51 C50 56 36 62 36 83" />
    <path d="M64 19 C64 40 50 46 50 51 C50 56 64 62 64 83" />
    <path d="M42 76 L58 76" />
  </g>,
]

export function CoverArt({ index }: { index: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-3 -right-2 h-[104px] w-[104px] text-white opacity-30"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {MOTIFS[index % MOTIFS.length]}
    </svg>
  )
}
