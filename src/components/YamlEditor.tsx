import { useMemo, useRef, type ReactNode } from 'react'

const LINE = 20 // px, shared by the textarea, the highlight layer and the gutter

// Token colours stay inside the warm palette: keys bright, values dimmer, numbers amber.
function highlightValue(src: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /("[^"]*"|'[^']*'|-?\d+(?:\.\d+)?[a-z]?(?![\w.])|\b(?:true|false|null)\b|[{}[\],])/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index))
    const t = m[0]
    const cls = /^["']/.test(t)
      ? 'text-[#f4a3ad]'
      : /^[{}[\],]$/.test(t)
        ? 'text-faint'
        : 'text-warn'
    out.push(
      <span key={m.index} className={cls}>
        {t}
      </span>,
    )
    last = m.index + t.length
  }
  if (last < src.length) out.push(src.slice(last))
  return out
}

function highlightLine(line: string): ReactNode {
  if (/^\s*#/.test(line)) return <span className="text-faint italic">{line}</span>
  const m = line.match(/^(\s*(?:-\s+)?)([^\s:#{}[\],"'][^:#]*?)(:)(\s.*|$)/)
  if (!m) return highlightValue(line)
  const [, indent, key, colon, rest] = m
  const hash = rest.search(/\s#/)
  const value = hash >= 0 ? rest.slice(0, hash) : rest
  const comment = hash >= 0 ? rest.slice(hash) : ''
  return (
    <>
      {indent}
      <span className="text-ink">{key}</span>
      <span className="text-faint">{colon}</span>
      {highlightValue(value)}
      {comment && <span className="text-faint italic">{comment}</span>}
    </>
  )
}

/** A textarea with a highlight layer behind it and a line-number gutter. */
export function YamlEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const codeRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const lines = useMemo(() => value.split('\n'), [value])

  function sync(e: React.UIEvent<HTMLTextAreaElement>) {
    const { scrollTop, scrollLeft } = e.currentTarget
    if (codeRef.current) codeRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-scrollTop}px)`
  }

  const shared = { fontSize: 13, lineHeight: `${LINE}px`, padding: '16px 16px 16px 60px' } as const

  return (
    <div className="relative h-[34rem] overflow-hidden rounded-lg border border-line-strong bg-canvas font-mono focus-within:border-faint">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-11 border-r border-line bg-panel/60" />
      <div ref={gutterRef} className="pointer-events-none absolute left-0 top-0 w-11 select-none py-4 pr-2.5 text-right text-xs text-faint" style={{ lineHeight: `${LINE}px` }} aria-hidden>
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <pre
        ref={codeRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 m-0 min-w-full whitespace-pre text-muted"
        style={shared}
      >
        {lines.map((l, i) => (
          <div key={i} style={{ minHeight: LINE }}>
            {highlightLine(l)}
          </div>
        ))}
      </pre>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={sync}
        spellCheck={false}
        wrap="off"
        placeholder={placeholder}
        aria-label="Schema YAML"
        className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent text-transparent caret-ink outline-none placeholder:text-faint"
        style={shared}
      />
    </div>
  )
}
