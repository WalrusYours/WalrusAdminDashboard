import { useEffect, useState, type ReactNode } from 'react'
import { THEME_KEY, ThemeContext, type ThemeSetting } from './themeContext'

function readSetting(): ThemeSetting {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    /* storage unavailable */
  }
  return 'dark'
}

function resolve(setting: ThemeSetting): 'dark' | 'light' {
  if (setting !== 'system') return setting
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [setting, setSettingState] = useState<ThemeSetting>(readSetting)

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolve(setting)
    }
    apply()
    if (setting !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [setting])

  const setSetting = (s: ThemeSetting) => {
    setSettingState(s)
    try {
      localStorage.setItem(THEME_KEY, s)
    } catch {
      /* ignore */
    }
  }

  return <ThemeContext.Provider value={{ setting, setSetting }}>{children}</ThemeContext.Provider>
}
