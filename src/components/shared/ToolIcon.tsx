import type { AppToolId } from '../../types/app'

interface ToolIconProps {
  toolId: AppToolId
  className?: string
}

export function ToolIcon({ toolId, className = 'h-5 w-5' }: ToolIconProps) {
  if (toolId === 'video-merge') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M7 7h10M7 17h10M13 4l4 3-4 3M11 14l-4 3 4 3" />
      </svg>
    )
  }

  if (toolId === 'video-convert') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M4 7h9M11 4l3 3-3 3M20 17h-9M13 14l-3 3 3 3" />
      </svg>
    )
  }

  if (toolId === 'video-trim') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M7 4v16M17 4v16M7 12h10M7 7h4M13 17h4" />
      </svg>
    )
  }

  if (toolId === 'video-extract-audio') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M6 9v6M10 6v12M14 8v8M18 10v4" />
      </svg>
    )
  }

  if (toolId === 'video-resize') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M20 20h-4v-4" />
      </svg>
    )
  }

  if (toolId === 'image-convert') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="m8 14 2.5-2.5L13 14l2-2 3 3" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
      <path d="M5 12h14M12 5v14" />
    </svg>
  )
}
