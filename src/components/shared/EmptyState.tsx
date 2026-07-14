interface EmptyStateProps {
  title: string
  description: string
  badge?: string
}

export function EmptyState({ title, description, badge }: EmptyStateProps) {
  return (
    <section className="empty-state-shell">
      <div className="empty-state">
        <div className="empty-state-mark" aria-hidden="true"><span /></div>
        {badge ? <span className="badge mb-4">{badge}</span> : null}
        <h2 className="text-2xl font-extrabold text-slate-950">{title}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">{description}</p>
      </div>
    </section>
  )
}
