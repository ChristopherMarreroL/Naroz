import { useLocale } from '../../i18n/LocaleProvider'

interface NotFoundViewProps {
  onGoHome: () => void
}

export function NotFoundView({ onGoHome }: NotFoundViewProps) {
  const { t } = useLocale()

  return (
    <section className="panel flex min-h-[55vh] flex-col items-center justify-center px-6 py-16 text-center sm:px-10">
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-sky-600">404</p>
      <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">{t('notFoundTitle')}</h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">{t('notFoundDescription')}</p>
      <button type="button" className="btn-primary mt-8" onClick={onGoHome}>
        {t('returnHome')}
      </button>
    </section>
  )
}
