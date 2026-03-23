import { useRef, useState, type ReactNode } from 'react'

import { useLocale } from '../../i18n/LocaleProvider'

interface FileDropzoneProps {
  title: string
  description: string
  buttonLabel: string
  accept?: string
  multiple?: boolean
  disabled?: boolean
  aside?: ReactNode
  onSelect: (files: FileList | null) => void
}

export function FileDropzone({
  title,
  description,
  buttonLabel,
  accept,
  multiple = false,
  disabled = false,
  aside,
  onSelect,
}: FileDropzoneProps) {
  const { t } = useLocale()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFiles = (files: FileList | null) => {
    if (disabled || !files?.length) {
      return
    }

    onSelect(files)
  }

  return (
    <section
      className={`panel overflow-hidden p-6 transition sm:p-8 ${isDragging ? 'border-sky-300 shadow-[0_24px_70px_-35px_rgba(14,165,233,0.35)]' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) {
          setIsDragging(true)
        }
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        const relatedTarget = event.relatedTarget as Node | null
        if (!event.currentTarget.contains(relatedTarget)) {
          setIsDragging(false)
        }
      }}
      onDrop={(event) => {
        event.preventDefault()
        setIsDragging(false)
        handleFiles(event.dataTransfer.files)
      }}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">{title}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{description}</p>
          <div className={`mt-5 rounded-[1.35rem] border border-dashed px-4 py-5 transition sm:px-5 ${isDragging ? 'border-sky-400 bg-sky-50' : 'border-slate-300 bg-slate-50/80'}`}>
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl ${isDragging ? 'bg-sky-500 text-white' : 'bg-white text-slate-700'}`}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
                  <path d="M12 16V6" />
                  <path d="m8 10 4-4 4 4" />
                  <path d="M5 18h14" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{t('dragDropTitle')}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{isDragging ? t('dropNow') : t('dragDropHint')}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:min-w-72">
          <button type="button" className="btn-primary w-full" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
              <path d="M12 4v10" />
              <path d="m8 10 4 4 4-4" />
              <path d="M5 19h14" />
            </svg>
            {buttonLabel}
          </button>
          <p className="text-xs leading-5 text-slate-500">{t('chooseOrDropFiles')}</p>
          {aside}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />
    </section>
  )
}
