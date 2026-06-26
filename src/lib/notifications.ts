import { sileo } from 'sileo'

export type NotificationTone = 'error' | 'warning' | 'success' | 'info'

const RECENT_NOTIFICATION_TTL_MS = 800
const recentNotifications = new Map<string, number>()

const durations: Record<NotificationTone, number> = {
  error: 6500,
  warning: 6000,
  success: 4200,
  info: 4200,
}

export function notify(tone: NotificationTone, title: string, message: string) {
  const normalizedMessage = message.trim()
  const key = `${tone}:${title}:${normalizedMessage}`
  const now = Date.now()
  const lastShownAt = recentNotifications.get(key)

  if (lastShownAt && now - lastShownAt < RECENT_NOTIFICATION_TTL_MS) {
    return
  }

  recentNotifications.set(key, now)

  sileo[tone]({
    title,
    description: normalizedMessage,
    duration: durations[tone],
  })
}
