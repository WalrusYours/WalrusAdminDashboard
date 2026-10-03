import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { en } from './en'
import { LANG_KEY, I18nContext, type Dict, type Locale, type Params } from './i18nContext'
import { ro } from './ro'
import { ru } from './ru'

const DICTS: Record<Locale, Dict> = { en, ru, ro }

function detect(): Locale {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'en' || saved === 'ru' || saved === 'ro') return saved
  } catch {
    /* storage unavailable */
  }
  for (const lang of navigator.languages ?? [navigator.language]) {
    const short = lang.slice(0, 2).toLowerCase()
    if (short === 'ru' || short === 'ro') return short
  }
  return 'en'
}

function fill(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''))
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detect)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      localStorage.setItem(LANG_KEY, l)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(() => {
    const dict = DICTS[locale]
    const rules = new Intl.PluralRules(locale)
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

    const t = (key: string, params?: Params) => {
      const entry = dict[key]
      return fill(typeof entry === 'string' ? entry : key, params)
    }

    const tp = (key: string, count: number, params?: Params) => {
      const entry = dict[key] ?? en[key]
      const all = { count, ...params }
      if (typeof entry === 'string') return fill(entry, all)
      if (!entry) return fill(key, all)
      return fill(entry[rules.select(count)] ?? entry.other ?? key, all)
    }

    const timeAgo = (iso?: string) => {
      if (!iso) return t('never')
      const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
      if (seconds < 60) return t('just now')
      if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute')
      if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), 'hour')
      return rtf.format(-Math.floor(seconds / 86400), 'day')
    }

    const date = (iso: string) => new Date(iso).toLocaleDateString(locale)

    const msg = (text: string) => {
      const applied = text.match(/^applied as version (\d+)$/)
      if (applied) return t('applied as version {n}', { n: applied[1] })
      const errors = text.match(/^(\d+) validation error(?:s|\(s\))?$/)
      if (errors) return tp('{count} validation errors', Number(errors[1]))
      return t(text)
    }

    return { locale, setLocale, t, tp, timeAgo, date, msg }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
