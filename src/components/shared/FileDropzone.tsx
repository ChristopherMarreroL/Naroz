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
    <section className="upload-surface">
      <div className="upload-layout">
        <div className="min-w-0">
          <h2 className="upload-title">{title}</h2>
          <p className="upload-description">{description}</p>

          <label
            className={`upload-dropzone ${isDragging ? 'upload-dropzone-active' : ''} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
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

            <span className={`upload-icon ${isDragging ? 'upload-icon-active' : ''}`}>
              {icon ?? (
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-7 w-7 fill-none stroke-current" strokeWidth="1.8">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              )}
            </span>
            <span className="upload-label">{isDragging ? t('dropYourFilesHere') : resolvedUploadLabel}</span>
            <span className="upload-hint">{t('chooseOrDropFiles')}</span>
          </label>
        </div>

        <aside className="upload-meta">
          {acceptedFormats ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('allowedFormats')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{acceptedFormats}</p>
            </div>
          ) : null}
          {maxSize ? (
            <div className="min-w-0">
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
