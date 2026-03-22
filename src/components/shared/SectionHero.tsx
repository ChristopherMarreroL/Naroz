import type { ReactNode } from 'react'

interface SectionHeroProps {
  badge: string
  title: string
  description: string
  aside?: ReactNode
}

export function SectionHero({ badge, title, description, aside }: SectionHeroProps) {
  return (
    <section className="panel relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
      <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.1),transparent_70%)]" />
      <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
        <div>
          <span className="badge mb-4 bg-slate-900 text-slate-50">{badge}</span>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">{description}</p>
        </div>

        {aside ? aside : null}
      </div>
    </section>
  )
}
