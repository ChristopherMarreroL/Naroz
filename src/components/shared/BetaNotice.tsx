import { useLocale } from '../../i18n/LocaleProvider'

interface BetaNoticeProps {
  message?: string
}

export function BetaNotice({ message }: BetaNoticeProps) {
  const { t } = useLocale()

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      <p className="font-semibold">{t('betaBadge')}</p>
      <p className="mt-1 leading-6">{message ?? t('betaDefaultMessage')}</p>
    </div>
  )
}
