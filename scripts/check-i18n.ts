// Fails when a string used in the UI has no Russian or Romanian translation, when a plural
// entry misses a form its language needs, or when a translation changes the {placeholders}.
// Run: npm run check:i18n
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../src/i18n/en.ts'
import type { Dict } from '../src/i18n/i18nContext.ts'
import { ro } from '../src/i18n/ro.ts'
import { ru } from '../src/i18n/ru.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

// Messages that come from the Go engine or the mock, so they never appear in a t() call.
const ENGINE_MESSAGES = [
  'dry run: nothing was changed',
  'unchanged: no new version',
  'could not parse the schema',
  'breaking change: stored data must be re-imported and similarity recomputed. Confirm to apply.',
  'Wrong admin key.',
  'Cannot reach the engine. Is it running?',
]

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(e.name) ? [p] : []
  })
}

const DICTIONARIES = ['en.ts', 'ru.ts', 'ro.ts']
const files = walk(root).filter((f) => !DICTIONARIES.includes(path.basename(f)))
const sources = files.map((f) => fs.readFileSync(f, 'utf8'))
const all = sources.join('\n')

// every literal passed to t(...) or tp(...)
const used = new Set<string>()
const call = /\bt(?:p)?\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g
for (const src of sources) {
  for (const m of src.matchAll(call)) used.add(m[2].replace(/\\(['"])/g, '$1'))
}

const errors: string[] = []
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
const forms = (v: Dict[string]) => (typeof v === 'string' ? null : v)

function check(name: string, dict: Dict, locale: string) {
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories
  for (const key of used) {
    if (!(key in dict) && !(key in en)) errors.push(`${name}: missing translation for "${key}"`)
  }
  for (const [key, value] of Object.entries(dict)) {
    const f = forms(value)
    if (f) {
      for (const c of categories) {
        if (!f[c]) errors.push(`${name}: "${key}" has no "${c}" plural form`)
      }
      for (const [c, text] of Object.entries(f)) {
        if (placeholders(text as string) !== placeholders(key)) errors.push(`${name}: "${key}" [${c}] changes the placeholders`)
      }
    } else if (placeholders(value as string) !== placeholders(key)) {
      errors.push(`${name}: "${key}" changes the placeholders`)
    }
    const quoted = [`'${key}'`, `"${key}"`, `'${key.replace(/'/g, "\\'")}'`, `\`${key}\``]
    if (!quoted.some((q) => all.includes(q)) && !ENGINE_MESSAGES.includes(key) && !key.includes('breaking change: re-import')) {
      errors.push(`${name}: "${key}" is not used anywhere in the UI (typo or dead entry)`)
    }
  }
}

check('ru', ru, 'ru')
check('ro', ro, 'ro')

const onlyRu = Object.keys(ru).filter((k) => !(k in ro))
const onlyRo = Object.keys(ro).filter((k) => !(k in ru))
for (const k of onlyRu) errors.push(`"${k}" is in ru but not in ro`)
for (const k of onlyRo) errors.push(`"${k}" is in ro but not in ru`)

for (const [key, value] of Object.entries(en)) {
  const f = forms(value)
  if (!f?.one || !f.other) errors.push(`en: "${key}" needs one and other forms`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  console.error(`\n${errors.length} i18n problem(s)`)
  process.exit(1)
}
console.log(`i18n ok: ${used.size} strings used in the UI, ${Object.keys(ru).length} entries per language (ru, ro)`)
