import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { UNAUTHORIZED_EVENT } from '../api/http'
import { useApp } from '../context/appContext'
import { Logo } from './Logo'
import { Button, Notice } from './ui'

type State = 'checking' | 'in' | 'out'

export function AuthGate({ children }: { children: ReactNode }) {
  const { api } = useApp()
  const [state, setState] = useState<State>('checking')

  useEffect(() => {
    let alive = true
    api.session().then((ok) => alive && setState(ok ? 'in' : 'out'))
    return () => {
      alive = false
    }
  }, [api])

  useEffect(() => {
    const out = () => setState('out')
    window.addEventListener(UNAUTHORIZED_EVENT, out)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, out)
  }, [])

  const signedIn = useCallback(() => setState('in'), [])

  if (state === 'checking') return <div className="min-h-screen" />
  if (state === 'out') return <LoginPage onSignedIn={signedIn} />
  return <>{children}</>
}

function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const { api } = useApp()
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.login(key)
      setKey('')
      onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-line bg-panel p-7">
        <div className="flex items-center gap-3">
          <Logo size={38} />
          <div className="leading-tight">
            <div className="text-lg font-semibold tracking-tight">WALRUS</div>
            <div className="text-xs text-faint">Admin dashboard</div>
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-xs uppercase tracking-wider text-faint">Admin key</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="WALRUS_ADMIN_KEY"
            className="w-full rounded-lg border border-line-strong bg-raised px-3 py-2.5 font-mono text-sm placeholder:text-faint"
          />
        </label>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !key}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-xs text-faint">
          The key is set in the engine's environment. It is exchanged for a short-lived session cookie and is not stored in the browser.
        </p>
      </form>
    </div>
  )
}
