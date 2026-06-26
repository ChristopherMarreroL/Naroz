import { useRef, useState, type ReactNode } from 'react'

import { useLocale } from '../../i18n/LocaleProvider'
import { notify } from '../../lib/notifications'

interface FileDropzoneProps {
  title: string
  description: string
  buttonLabel?: string
  uploadLabel?: string
  accept?: string
  acceptedFormats?: string
  maxSize?: number
  multiple?: boolean
  disabled?: boolean
  aside?: ReactNode
  icon?: ReactNode
  onSelect: (files: FileList | null) => void
}

function formatMaxSize(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${Math.round(bytes / (1024 * 1024))} MB`
  }

  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }

  return `${bytes} B`
}

export function FileDropzone({
  title,
  description,
  buttonLabel,
  uploadLabel,
  accept,
  acceptedFormats,
  maxSize,
  multiple = false,
  disabled = false,
  aside,
  icon,
  onSelect,
}: FileDropzoneProps) {
  const { t } = useLocale()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const resolvedUploadLabel = uploadLabel ?? buttonLabel ?? (multiple ? t('uploadFilesDropzone') : t('uploadFileDropzone'))

  const handleFiles = (files: FileList | null) => {
    if (disabled || !files?.length) {
      return
    }

    if (maxSize) {
      const tooLarge = Array.from(files).find((file) => file.size > maxSize)
      if (tooLarge) {
        const message = `${t('invalidFile')}: ${tooLarge.name}. ${t('maximumSize')}: ${formatMaxSize(maxSize)}.`
        notify('error', t('invalidFile'), message)
        return
      }
    }
    onSelect(files)
  }

  return (
    <section className="panel overflow-hidden p-4 transition sm:p-6 lg:p-8">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)] lg:items-stretch">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-950 sm:text-3xl">{title}</h2>
          <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{description}</p>

          <label
            className={`mt-5 flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed bg-white px-4 py-7 text-center transition sm:px-6 ${
              isDragging ? 'border-slate-950 bg-slate-50 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.45)]' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
            } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            onDragOver={(event) => {
              if (disabled) {
                return
              }

              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setIsDragging(true)
            }}
            onDragLeave={(event) => {
              event.preventDefault()
              const relatedTarget = event.relatedTarget as Node | null
              if (!event.currentTarget.contains(relatedTarget)) {
                setIsDragging(false)
              }
            }}
            onDrop={(event) => {
              if (disabled) {
                return
              }

              event.preventDefault()
              setIsDragging(false)
              handleFiles(event.dataTransfer.files)
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept={accept}
              multiple={multiple}
              disabled={disabled}
              className="sr-only"
              onChange={(event) => {
                handleFiles(event.target.files)
                event.currentTarget.value = ''
              }}
            />

            <span className={`grid h-14 w-14 place-items-center rounded-2xl transition ${isDragging ? 'bg-slate-800 text-white' : 'bg-slate-950 text-white'}`}>
              {icon ?? (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-none stroke-current" strokeWidth="1.8">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              )}
            </span>
            <span className="text-sm font-semibold text-slate-900">{isDragging ? t('dropYourFilesHere') : resolvedUploadLabel}</span>
            <span className="max-w-xl text-xs leading-5 text-slate-500">{t('chooseOrDropFiles')}</span>
          </label>
        </div>

        <aside className="grid content-start gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          {acceptedFormats ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('allowedFormats')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{acceptedFormats}</p>
            </div>
          ) : null}
          {maxSize ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('maximumSize')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{formatMaxSize(maxSize)}</p>
            </div>
          ) : null}
          {aside}
        </aside>
      </div>
    </section>
  )
}
