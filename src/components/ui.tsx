import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useI18n } from '../i18n/i18nContext'

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:bg-accent-hover font-semibold',
  secondary: 'bg-raised text-ink border border-line-strong hover:border-faint',
  ghost: 'text-muted hover:text-ink hover:bg-raised',
  danger: 'text-bad border border-line-strong hover:border-bad hover:bg-raised',
}

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors',
        'disabled:cursor-not-allowed disabled:border disabled:border-line disabled:bg-raised disabled:text-faint disabled:hover:bg-raised disabled:hover:text-faint',
        VARIANTS[variant],
        className,
      )}
    />
  )
}

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cx('rounded-xl border border-line bg-panel', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad'
const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-muted border-line-strong',
  accent: 'bg-accent-soft text-accent border-accent/30',
  ok: 'bg-raised text-ok border-ok/30',
  warn: 'bg-raised text-warn border-warn/30',
  bad: 'bg-raised text-bad border-bad/30',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs', TONES[tone])}>
      {children}
    </span>
  )
}

const NOTICE_BORDER: Record<Tone, string> = {
  neutral: 'border-line-strong',
  accent: 'border-accent/40',
  ok: 'border-ok/40',
  warn: 'border-warn/40',
  bad: 'border-bad/40',
}

export function Notice({ tone = 'neutral', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div className={cx('rounded-lg border bg-raised px-4 py-3 text-sm', NOTICE_BORDER[tone])}>
      {title && <div className="font-semibold text-ink">{title}</div>}
      {children && <div className={cx('text-muted', title && 'mt-1')}>{children}</div>}
    </div>
  )
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useI18n()
  const [done, setDone] = useState(false)
  return (
    <Button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {done ? t('Copied') : (label ?? t('Copy'))}
    </Button>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  label,
  marker,
  disabled,
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label: string
  /** optional tick (same units as value), e.g. the schema default */
  marker?: number
  disabled?: boolean
}) {
  const pct = (v: number) => `${Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100))}%`
  return (
    <div className="relative">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={cx('block w-full', disabled && 'cursor-not-allowed opacity-40')}
        style={{ ['--fill' as string]: pct(value) }}
      />
      {marker !== undefined && (
        <span
          className="pointer-events-none absolute top-[-3px] h-3 w-px bg-faint"
          style={{ left: pct(marker) }}
          title={`default ${marker}`}
        />
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-4 py-8 text-center text-sm text-faint">
      {children}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-xs uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  )
}
