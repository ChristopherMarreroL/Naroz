import { useLocale } from '../../i18n/LocaleProvider'
import type { Locale } from '../../i18n/LocaleProvider'

interface TopBarProps {
  locale: Locale
  setLocale: (locale: Locale) => void
  onOpenSidebar: () => void
  onGoHome: () => void
}

export function TopBar({ locale, setLocale, onOpenSidebar, onGoHome }: TopBarProps) {
  const { t } = useLocale()

  return (
    <div className="fixed inset-x-0 top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-5 lg:px-8 lg:pt-6">
      <header className="mx-auto w-full max-w-[1560px] panel px-4 py-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label={locale === 'es' ? 'Abrir navegacion' : 'Open navigation'}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900 transition hover:bg-slate-50"
              onClick={onOpenSidebar}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.9">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onGoHome}
              className="inline-flex items-center rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-50"
            >
              Naroz
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 sm:inline">{t('language')}</span>
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                locale === 'es' ? 'bg-slate-900 text-white shadow-[0_8px_20px_-12px_rgba(15,23,42,0.65)]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setLocale('es')}
            >
              ES
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                locale === 'en' ? 'bg-slate-900 text-white shadow-[0_8px_20px_-12px_rgba(15,23,42,0.65)]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>
        </div>
      </header>
    </div>
  )
}
