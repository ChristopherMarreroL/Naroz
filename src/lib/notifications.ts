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

const fills: Record<NotificationTone, string> = {
  error: '#4a1f2a',
  warning: '#493713',
  success: '#123a35',
  info: '#172b4d',
}

export function notify(tone: NotificationTone, title: string, message: string, duration?: number) {
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
    duration: duration ?? durations[tone],
    fill: fills[tone],
  })
}
