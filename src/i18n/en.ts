import type { Dict } from './i18nContext'

// English is the source language: strings are their own keys. Only plural forms need entries.
export const en: Dict = {
  '{count} problems': { one: '{count} problem', other: '{count} problems' },
  '{count} unsaved changes': { one: '{count} unsaved change', other: '{count} unsaved changes' },
  '{count} schema changes': { one: '{count} schema change', other: '{count} schema changes' },
  '{count} unchanged lines': { one: '{count} unchanged line', other: '{count} unchanged lines' },
  'Engine: {count} problems': { one: 'Engine: {count} problem', other: 'Engine: {count} problems' },
  '{count} attributes': { one: '{count} attribute', other: '{count} attributes' },
  '{count} attrs': { one: '{count} attr', other: '{count} attrs' },
  '{count} computed': { one: '{count} computed', other: '{count} computed' },
  '{count} validation errors': { one: '{count} validation error', other: '{count} validation errors' },
  '{count} knobs': { one: '{count} knob', other: '{count} knobs' },
  '{count} presets': { one: '{count} preset', other: '{count} presets' },
  '{count} interaction types': { one: '{count} interaction type', other: '{count} interaction types' },
  '{count} more': { one: '{count} more', other: '{count} more' },
}
