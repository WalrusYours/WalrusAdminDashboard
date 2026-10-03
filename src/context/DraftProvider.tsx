import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { ActiveSchema } from '../api/types'
import { useApp } from './appContext'
import { DraftContext } from './draftContext'

/** Holds the schema YAML being edited. The Weights and Schema pages both edit this draft. */
export function DraftProvider({ children }: { children: ReactNode }) {
  const { api } = useApp()
  const [active, setActive] = useState<ActiveSchema | null | undefined>(undefined)
  const [text, setText] = useState('')

  const refresh = useCallback(async () => {
    const s = await api.getSchema()
    setActive(s)
    setText(s?.yaml ?? '')
  }, [api])

  // reload and reset the draft whenever the tenant (and so the api object) changes
  useEffect(() => {
    setActive(undefined)
    void refresh()
  }, [refresh])

  const discard = useCallback(() => setText(active?.yaml ?? ''), [active])
  const dirty = active !== undefined && text !== (active?.yaml ?? '')

  return (
    <DraftContext.Provider value={{ active, text, setText, dirty, discard, refresh }}>{children}</DraftContext.Provider>
  )
}
