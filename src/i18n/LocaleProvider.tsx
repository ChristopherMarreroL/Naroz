/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import esMessages from './messages.es'

export type Locale = 'es' | 'en'
export type Messages = Record<string, string>

const STORAGE_KEY = 'naroz-locale'

function detectLocale(): Locale {
  if (typeof window === 'undefined') {
    return 'en'
  }

  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'es' || saved === 'en') {
    return saved
  }

  return window.navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
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
  const [activeMessages, setActiveMessages] = useState<Messages>(() => messageCache[locale] ?? esMessages)

  useEffect(() => {
    let isCurrent = true

    window.localStorage.setItem(STORAGE_KEY, locale)
    document.documentElement.lang = locale

    loadMessages(locale).then((loadedMessages) => {
      if (isCurrent) {
        setActiveMessages(loadedMessages)
      }
    })

    return () => {
      isCurrent = false
    }
  }, [locale])

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      t: (key: string) => activeMessages[key] ?? esMessages[key] ?? key,
    }),
    [activeMessages, locale],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider')
  }

  return context
}
