interface AlertBannerProps {
  tone: 'error' | 'warning' | 'success' | 'info'
  title: string
  message: string
}

const toneStyles: Record<AlertBannerProps['tone'], string> = {
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
}

export function AlertBanner({ tone, title, message }: AlertBannerProps) {
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${toneStyles[tone]}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 leading-6">{message}</p>
    </div>
  )
}
