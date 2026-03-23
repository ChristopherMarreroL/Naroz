import type { ReactNode } from 'react'

interface SectionHeroProps {
  badge: string
  title: string
  description: string
  aside?: ReactNode
}

export function SectionHero({ badge, title, description, aside }: SectionHeroProps) {
  return (
    <section className="panel relative z-0 min-w-0 overflow-hidden px-4 py-5 sm:px-7 sm:py-6 lg:px-8 lg:py-5 xl:py-6">
      <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.08),transparent_70%)] sm:h-28" />
      <div className="absolute -right-20 top-10 h-44 w-44 rounded-full bg-sky-100/45 blur-3xl sm:h-56 sm:w-56" />
      <div className="relative grid min-w-0 max-w-full gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <span className="badge mb-3 bg-slate-900 text-slate-50">{badge}</span>
          <h1 className="max-w-[12ch] break-words text-[clamp(1.65rem,3.9vw,3.35rem)] font-extrabold leading-[0.92] tracking-[-0.05em] text-slate-950 sm:max-w-[12ch] lg:max-w-[9ch] xl:max-w-[10ch]">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 sm:mt-3 sm:text-base sm:leading-7 lg:text-lg lg:leading-8">{description}</p>
        </div>

        {aside ? <div className="min-w-0 lg:pt-2">{aside}</div> : null}
      </div>
    </section>
  )
}
