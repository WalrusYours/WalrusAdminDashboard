import { LOCALES, useI18n } from '../i18n/i18nContext'
import { useTheme, type ThemeSetting } from '../theme/themeContext'
import { cx } from './ui'

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; text: string; title?: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5 rounded-lg border border-line bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.title ?? o.text}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            'rounded-md px-2 py-1 text-xs transition-colors',
            value === o.id ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink',
          )}
        >
          {o.text}
        </button>
      ))}
    </div>
  )
}

/** Language and theme switchers, shown in the sidebar and on the sign-in screen. */
export function Preferences() {
  const { locale, setLocale, t } = useI18n()
  const { setting, setSetting } = useTheme()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label={t('Language')}
        value={locale}
        options={LOCALES.map((l) => ({ id: l.id, text: l.id.toUpperCase(), title: l.label }))}
        onChange={setLocale}
      />
      <Segmented<ThemeSetting>
        label={t('Theme')}
        value={setting}
        options={[
          { id: 'dark', text: t('Dark') },
          { id: 'light', text: t('Light') },
          { id: 'system', text: t('Auto') },
        ]}
        onChange={setSetting}
      />
    </div>
  )
}
