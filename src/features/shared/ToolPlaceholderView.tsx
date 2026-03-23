import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'

interface ToolPlaceholderViewProps {
  badge: string
  title: string
  description: string
}

export function ToolPlaceholderView({ badge, title, description }: ToolPlaceholderViewProps) {
  const { t } = useLocale()

  return (
    <>
      <SectionHero
        badge={badge}
          title={title}
          description={description}
          aside={
            <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('nextStep')}</p>
              <div className="mt-4 space-y-2 text-sm text-slate-200">
                <div className="rounded-2xl bg-white/8 px-4 py-3">{t('uiBaseReady')}</div>
                <div className="rounded-2xl bg-white/8 px-4 py-3">{t('processingPlanned')}</div>
              </div>
            </div>
          }
        />

      <section className="panel p-6 sm:p-8">
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('toolInProgress')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{t('toolInProgressDesc')}</p>
        </div>
      </section>
    </>
  )
}
