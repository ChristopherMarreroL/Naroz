import type { ReactNode } from 'react'

import { useLocale } from '../../i18n/LocaleProvider'
import narozLogo from '../../assets/naroz-logo.jpg'

interface SectionHeroProps {
  badge: string
  title: string
  description: string
  aside?: ReactNode
}

export function SectionHero({ badge, title, description, aside }: SectionHeroProps) {
  const { t } = useLocale()

  return (
    <section className="panel tool-hero relative z-0 min-w-0 overflow-hidden px-4 py-5 sm:px-7 sm:py-6 lg:px-8 lg:py-7">
      <div className="tool-hero-glow" />
      <div className="tool-hero-orb" />
      <div className={`tool-hero-grid relative grid min-w-0 max-w-full gap-5 sm:gap-6 ${aside ? 'lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]' : ''}`}>
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-3">
            <div className="tool-hero-logo">
              <img src={narozLogo} alt={t('narozLogoAlt')} className="h-full w-full object-contain" decoding="async" fetchPriority="high" />
            </div>
            <div className="min-w-0">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-slate-400">Naroz</p>
              <span className="tool-hero-badge">{badge}</span>
            </div>
          </div>
          <h1 className={`tool-hero-title ${aside ? 'max-w-[18ch]' : 'max-w-[26ch]'}`}>
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:mt-3 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">{description}</p>
        </div>

        {aside ? <div className="tool-hero-aside min-w-0 lg:pt-2">{aside}</div> : null}
      </div>
    </section>
  )
}
