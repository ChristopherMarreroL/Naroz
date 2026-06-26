import { useCallback, useState } from 'react'

import { notify, type NotificationTone } from '../lib/notifications'

export interface ToastNotice {
  tone: NotificationTone
  title: string
  message: string
}

export function useToastNotice<TNotice extends ToastNotice | null>(initialNotice: TNotice) {
  const [visibleNotice, setVisibleNotice] = useState<TNotice>(initialNotice)

  const setNotice = useCallback((nextNotice: TNotice | null) => {
    if (!nextNotice) {
      setVisibleNotice(null as TNotice)
      return
    }

    if (nextNotice.tone !== 'info') {
      notify(nextNotice.tone, nextNotice.title, nextNotice.message)
      setVisibleNotice(null as TNotice)
      return
    }

    setVisibleNotice(nextNotice as TNotice)
  }, [])

  return [visibleNotice, setNotice] as const
}
