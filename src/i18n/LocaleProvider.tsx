/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

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
  const [locale, setLocaleState] = useState<Locale>(detectLocale)
  const [loadedMessages, setLoadedMessages] = useState<{ locale: Locale; messages: Messages } | null>(() => {
    const messages = messageCache[locale]
    return messages ? { locale, messages } : null
  })
  const activeMessages = loadedMessages?.locale === locale ? loadedMessages.messages : messageCache[locale] ?? null

  const setLocale = useCallback((nextLocale: Locale) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, nextLocale)
    } catch {
      // The selected locale remains active for the current session.
    }

    setLocaleState(nextLocale)
  }, [])

  useEffect(() => {
    let isCurrent = true

    document.documentElement.lang = locale

    loadMessages(locale).then((messages) => {
      if (isCurrent) {
        setLoadedMessages({ locale, messages })
      }
    })

    return () => {
      isCurrent = false
    }
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
