/** 线描冰淇淋图标（无文字）：极简白线风格，用于启动页与各处 logo */
export function IceCreamIcon({
  size = 64,
  color = 'currentColor',
  strokeWidth = 2.5,
  className = '',
}: {
  size?: number
  color?: string
  strokeWidth?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-label="scoop words"
    >
      {/* 蛋筒 */}
      <path d="M20 30 L44 30 L32 56 Z" />
      <path d="M32 36 L32 48" />
      <path d="M26 41 L38 41" />
      {/* 奶油球 */}
      <circle cx="32" cy="17" r="13" />
      {/* 高光弧线 */}
      <path d="M23 12 Q32 4 41 12" opacity="0.7" />
    </svg>
  )
}
