/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import esMessages from './messages.es'

export type Locale = 'es' | 'en'
export type Messages = Record<string, string>

const STORAGE_KEY = 'naroz-locale-preference-v2'
const LEGACY_STORAGE_KEY = 'naroz-locale'

function getSavedLocale(): Locale | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === 'es' || saved === 'en' ? saved : null
  } catch {
    return null
  }
}

export function resolveLocale(savedLocale: string | null, preferredLanguages: readonly string[]): Locale {
  if (savedLocale === 'es' || savedLocale === 'en') {
    return savedLocale
  }

  return preferredLanguages[0]?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

function detectDeviceLocale(): Locale {
  const preferredLanguages = window.navigator.languages?.length
    ? window.navigator.languages
    : [window.navigator.language]

  return resolveLocale(null, preferredLanguages)
}

function detectLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'en'
  }

  const savedLocale = getSavedLocale()
  if (savedLocale) {
    return savedLocale
  }

  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    // Locale detection still works when storage is unavailable.
  }

  return detectDeviceLocale()
}

const messageCache: Partial<Record<Locale, Messages>> = {
  es: esMessages,
}

async function loadMessages(locale: Locale): Promise<Messages> {
  if (messageCache[locale]) {
    return messageCache[locale]
  }

  const module = await import('./messages.en')
  messageCache.en = module.default
  return module.default
}

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: string) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const requestVersion = useRef(0)
  const [requestedLocale, setRequestedLocale] = useState(() => ({ locale: detectLocale(), persist: false, version: 0 }))
  const [loadedMessages, setLoadedMessages] = useState<{ locale: Locale; messages: Messages } | null>(() => {
    const messages = messageCache[requestedLocale.locale]
    return messages ? { locale: requestedLocale.locale, messages } : null
  })

  const setLocale = useCallback((nextLocale: Locale) => {
    // A fresh request also allows retrying the same choice after a failed chunk load.
    requestVersion.current += 1
    setRequestedLocale({ locale: nextLocale, persist: true, version: requestVersion.current })
  }, [])

  useEffect(() => {
    let isCurrent = true

    loadMessages(requestedLocale.locale).then((messages) => {
      if (!isCurrent || requestedLocale.version !== requestVersion.current) return
      setLoadedMessages({ locale: requestedLocale.locale, messages })
      try {
        if (requestedLocale.persist) window.localStorage.setItem(STORAGE_KEY, requestedLocale.locale)
      } catch {
        // The selected locale remains active for the current session.
      }
    }).catch(() => {
      // Keep the current language and mounted tools intact. Selecting again retries.
    })

    return () => {
      isCurrent = false
    }
  }, [requestedLocale])

  const locale = loadedMessages?.locale ?? requestedLocale.locale
  const activeMessages = loadedMessages?.messages

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: string) => activeMessages?.[key] ?? key,
    }),
    [activeMessages, locale, setLocale],
  )

  if (!activeMessages) {
    return null
  }

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider')
  }

  return context
}
