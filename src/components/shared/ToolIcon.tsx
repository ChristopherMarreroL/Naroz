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

  if (toolId === 'video-remove-audio') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M4 9h4l5-4v14l-5-4H4Z" />
        <path d="m17 9 4 6" />
        <path d="m21 9-4 6" />
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

  if (toolId === 'video-speed') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M4 14a8 8 0 1 1 2.34 5.66" />
        <path d="M4 20v-6h6" />
        <path d="M12 8v4l3 2" />
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

  if (toolId === 'image-remove-background') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M5 19V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v12" />
        <path d="m8 14 2.5-2.5L13 14l2-2 2 2" />
        <path d="M4 19h16" />
      </svg>
    )
  }

  if (toolId === 'image-crop') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M7 4v10a3 3 0 0 0 3 3h10" />
        <path d="M4 7h10a3 3 0 0 1 3 3v10" />
      </svg>
    )
  }

  if (toolId === 'image-transform') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M7 5h10v10H7z" />
        <path d="m12 3 3 3-3 3" />
        <path d="M15 6H9a3 3 0 0 0-3 3v6" />
        <path d="m12 21-3-3 3-3" />
      </svg>
    )
  }

  if (toolId === 'document-merge-pdf') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M8 4h6l4 4v12H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <path d="M14 4v4h4M9 13h6M9 17h6" />
      </svg>
    )
  }

  if (toolId === 'document-delete-pages') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M8 4h6l4 4v12H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <path d="M10 12h4" />
        <path d="M9 9h6" />
        <path d="M11 15h2" />
      </svg>
    )
  }

  if (toolId === 'document-merge-docx') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M8 4h6l4 4v12H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <path d="M14 4v4h4M9 12l1.5 5L12 13l1.5 4 1.5-5" />
      </svg>
    )
  }

  if (toolId === 'document-msg-to-pdf') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M4 7h16v10H4z" />
        <path d="m4 8 8 6 8-6" />
        <path d="M15 16h4v4h-4z" />
      </svg>
    )
  }

  if (toolId === 'document-markdown-converter') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={className + ' stroke-current'} fill="none" strokeWidth="1.9">
        <path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
        <path d="M14 3v5h5" />
        <path d="M7 16v-5l2 2 2-2v5M14 11v5M14 16l3-3M14 16l-3-3" />
      </svg>
    )
  }

  if (toolId === 'document-excel-column-builder') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M5 4h14v16H5z" />
        <path d="M9 4v16M15 4v16M5 9h14M5 15h14" />
      </svg>
    )
  }

  if (toolId === 'document-excel-join') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M4 5h7v7H4zM13 12h7v7h-7z" />
        <path d="M8 12v2a2 2 0 0 0 2 2h3M13 8h-3a2 2 0 0 0-2 2v2" />
        <path d="M6.5 8h2M15.5 15h2" />
      </svg>
    )
  }


  if (toolId === 'utility-qr-generator') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
        <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
        <path d="M14 14h2v2h-2zM18 14h2v6h-4v-2h2zM14 18h2v2h-2z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`${className} stroke-current`} fill="none" strokeWidth="1.9">
      <path d="M5 12h14M12 5v14" />
    </svg>
  )
}

