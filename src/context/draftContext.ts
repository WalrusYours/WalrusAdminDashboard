import { createContext, useContext } from 'react'
import type { ActiveSchema } from '../api/types'

export interface DraftState {
  /** undefined while loading, null when the tenant has no schema yet */
  active: ActiveSchema | null | undefined
  text: string
  setText: (t: string) => void
  dirty: boolean
  discard: () => void
  refresh: () => Promise<void>
}

export const DraftContext = createContext<DraftState | null>(null)

export function useDraft(): DraftState {
  const v = useContext(DraftContext)
  if (!v) throw new Error('useDraft outside DraftProvider')
  return v
}
