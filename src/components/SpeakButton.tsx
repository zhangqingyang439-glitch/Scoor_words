import { speakWord } from './speech'

/** 通用发音按钮：点一下读单词 */
export function SpeakButton({
  word,
  className = '',
  size = 'md',
}: {
  word: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const cls = size === 'sm' ? 'h-6 w-6 text-xs' : size === 'lg' ? 'h-9 w-9 text-lg' : 'h-7 w-7 text-sm'
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        speakWord(word)
      }}
      title={`朗读 ${word}`}
      aria-label={`朗读 ${word}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 active:bg-emerald-100 ${cls} ${className}`}
    >
      🔊
    </button>
  )
}
