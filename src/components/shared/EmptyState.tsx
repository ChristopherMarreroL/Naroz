interface EmptyStateProps {
  title: string
  description: string
  badge?: string
}

export function EmptyState({ title, description, badge }: EmptyStateProps) {
  return (
    <section className="panel p-6 sm:p-8">
      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-12 text-center sm:px-8">
        {badge ? <span className="badge mb-4">{badge}</span> : null}
        <h2 className="text-2xl font-extrabold text-slate-950">{title}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{description}</p>
      </div>
    </section>
  )
}
