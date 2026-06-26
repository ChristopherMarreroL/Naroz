import { useLocale } from '../../../i18n/LocaleProvider'

interface QrPreviewProps {
  pngDataUrl: string | null
  size: number
}

export function QrPreview({ pngDataUrl, size }: QrPreviewProps) {
  const { t } = useLocale()
  const previewSize = Math.min(size, 420)

  return (
    <div className="panel-subtle p-4 sm:p-6">
      <div className="flex min-h-[420px] items-center justify-center rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 p-6">
        {pngDataUrl ? (
          <img
            src={pngDataUrl}
            alt={t('qrPreviewAlt')}
            className="rounded-2xl bg-white object-contain p-3 shadow-[0_24px_70px_-45px_rgba(15,23,42,0.7)]"
            style={{ width: previewSize, height: previewSize }}
          />
        ) : (
          <div className="max-w-sm text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white text-slate-900 shadow-sm">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-8 w-8 fill-none stroke-current" strokeWidth="1.8">
                <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
                <path d="M14 14h2v2h-2zM18 14h2v6h-4v-2h2zM14 18h2v2h-2z" />
              </svg>
            </div>
            <p className="mt-4 text-lg font-bold text-slate-950">{t('qrPreviewEmptyTitle')}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{t('qrPreviewEmptyDesc')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
