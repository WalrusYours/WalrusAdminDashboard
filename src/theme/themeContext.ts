import { createContext, useContext } from 'react'

export type ThemeSetting = 'dark' | 'light' | 'system'

export interface ThemeState {
  setting: ThemeSetting
  setSetting: (s: ThemeSetting) => void
}

export const ThemeContext = createContext<ThemeState | null>(null)

export function useTheme(): ThemeState {
  const v = useContext(ThemeContext)
  if (!v) throw new Error('useTheme outside ThemeProvider')
  return v
}

export const THEME_KEY = 'walrus-dashboard-theme'
