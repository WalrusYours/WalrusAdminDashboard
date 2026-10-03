import { createContext, useContext } from 'react'

export type Locale = 'en' | 'ru' | 'ro'

export type Plural = Partial<Record<Intl.LDMLPluralRule, string>>
export type Dict = Record<string, string | Plural>

export const LOCALES: { id: Locale; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Русский' },
  { id: 'ro', label: 'Română' },
]

export type Params = Record<string, string | number>

export interface I18nState {
  locale: Locale
  setLocale: (l: Locale) => void
  /** Translate a string keyed by its English text; `{name}` placeholders are filled from params. */
  t: (key: string, params?: Params) => string
  /** Translate a plural: the entry has one form per plural category of the locale. */
  tp: (key: string, count: number, params?: Params) => string
  /** "3 min ago", "yesterday"... in the current language. */
  timeAgo: (iso?: string) => string
  /** Translate a message produced by the engine or the mock ("applied as version 3"...). */
  msg: (text: string) => string
  date: (iso: string) => string
}

export const I18nContext = createContext<I18nState | null>(null)

export function useI18n(): I18nState {
  const v = useContext(I18nContext)
  if (!v) throw new Error('useI18n outside I18nProvider')
  return v
}

export const LANG_KEY = 'walrus-dashboard-lang'
