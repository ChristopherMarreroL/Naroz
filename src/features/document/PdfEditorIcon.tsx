type IconName = 'image' | 'text' | 'undo' | 'redo' | 'fullscreen' | 'exitFullscreen' | 'download' | 'more' | 'delete' | 'copy' | 'front' | 'back' | 'grow' | 'shrink' | 'edit' | 'select' | 'pages' | 'rotate' | 'crop' | 'bold' | 'italic' | 'left' | 'center' | 'right'

const paths: Record<IconName, string> = {
  image: 'M4 4h16v16H4V4Zm0 12 5-5 5 5 3-3 3 3M15 8h.01',
  text: 'M5 5h14M12 5v14M8 19h8',
  undo: 'm8 4-5 5 5 5M3 9h10a7 7 0 0 1 7 7v3',
  redo: 'm16 4 5 5-5 5M21 9H11a7 7 0 0 0-7 7v3',
  fullscreen: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  delete: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  copy: 'M9 9h12v12H9V9ZM5 15H3V3h12v2',
  front: 'M8 8h13v13H8V8ZM5 16H3V3h13v2',
  back: 'M3 3h13v13H3V3ZM19 8h2v13H8v-2',
  grow: 'M4 12h16M12 4v16',
  shrink: 'M4 12h16',
  edit: 'm4 16-1 5 5-1L21 7l-4-4L4 16Zm10-10 4 4',
  select: 'm5 3 14 10-7 1-3 7L5 3Z',
  exitFullscreen: 'M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3',
  pages: 'M8 3h12v18H8V3ZM4 5v14M11 8h6M11 12h6M11 16h4',
  rotate: 'M3 9a9 9 0 1 1 1 9M3 3v6h6',
  crop: 'M7 3v14h14M3 7h14v14',
  bold: 'M6 3h7a5 5 0 0 1 0 10H6V3Zm0 10h8a4 4 0 0 1 0 8H6v-8Z',
  italic: 'M10 3h10M4 21h10M15 3 9 21',
  left: 'M3 5h18M3 10h12M3 15h18M3 20h12',
  center: 'M3 5h18M6 10h12M3 15h18M6 20h12',
  right: 'M3 5h18M9 10h12M3 15h18M9 20h12',
}

export function PdfEditorIcon({ name }: { name: IconName }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
