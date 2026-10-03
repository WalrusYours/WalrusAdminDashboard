import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SchemaResult } from '../api/types'
import { diffSchemas, validateSchema } from '../lib/schema'
import { useApp } from './appContext'
import { useDraft } from './draftContext'

/** Validate, diff and deploy the schema draft. Shared by the Schema page and the graph editor. */
export function usePublish(onApplied?: () => void | Promise<void>) {
  const { api } = useApp()
  const { active, text, dirty, refresh } = useDraft()
  const [result, setResult] = useState<SchemaResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const errors = useMemo(() => (text.trim() ? validateSchema(text) : []), [text])
  const diff = useMemo(() => (text.trim() ? diffSchemas(active?.yaml ?? null, text) : null), [text, active])

  // a previous server result no longer describes the edited text
  useEffect(() => {
    setResult(null)
    setConfirm(false)
  }, [text])

  const run = useCallback(
    async (dryRun: boolean) => {
      setBusy(true)
      try {
        const r = await api.putSchema(text, { dryRun, confirmBreaking: confirm })
        setResult(r)
        if (!dryRun && r.ok) {
          await refresh()
          await onApplied?.()
        }
      } finally {
        setBusy(false)
      }
    },
    [api, text, confirm, refresh, onApplied],
  )

  const needsConfirm = diff?.verdict === 'breaking' && !!active
  const canApply = !!text.trim() && errors.length === 0 && (dirty || !active) && (!needsConfirm || confirm)

  return { errors, diff, result, busy, confirm, setConfirm, needsConfirm, canApply, run }
}
