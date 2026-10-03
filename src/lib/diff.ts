export type DiffLine = { kind: 'same' | 'add' | 'del'; text: string; oldNo?: number; newNo?: number }

export type Chunk = { type: 'lines'; lines: DiffLine[] } | { type: 'gap'; count: number }

function split(text: string): string[] {
  if (text === '') return []
  return text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n')
}

/** Line diff by longest common subsequence, after trimming the shared head and tail. */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = split(oldText)
  const b = split(newText)

  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head++
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++

  const x = a.slice(head, a.length - tail)
  const y = b.slice(head, b.length - tail)
  const out: DiffLine[] = []

  for (let i = 0; i < head; i++) out.push({ kind: 'same', text: a[i], oldNo: i + 1, newNo: i + 1 })

  let oldNo = head + 1
  let newNo = head + 1
  const del = (t: string) => out.push({ kind: 'del', text: t, oldNo: oldNo++ })
  const add = (t: string) => out.push({ kind: 'add', text: t, newNo: newNo++ })
  const same = (t: string) => out.push({ kind: 'same', text: t, oldNo: oldNo++, newNo: newNo++ })

  if (x.length * y.length > 4_000_000) {
    // too large for the table: show the middle as one removal and one addition
    x.forEach(del)
    y.forEach(add)
  } else {
    const n = x.length
    const m = y.length
    const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n && j < m) {
      if (x[i] === y[j]) {
        same(x[i])
        i++
        j++
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        del(x[i++])
      } else {
        add(y[j++])
      }
    }
    while (i < n) del(x[i++])
    while (j < m) add(y[j++])
  }

  for (let k = a.length - tail; k < a.length; k++) {
    out.push({ kind: 'same', text: a[k], oldNo: oldNo++, newNo: newNo++ })
  }
  return out
}

/** Keep changed lines with `context` lines around them; collapse the rest into gaps. */
export function collapse(lines: DiffLine[], context = 3): Chunk[] {
  const keep = new Array<boolean>(lines.length).fill(false)
  lines.forEach((l, i) => {
    if (l.kind === 'same') return
    for (let k = Math.max(0, i - context); k <= Math.min(lines.length - 1, i + context); k++) keep[k] = true
  })
  const chunks: Chunk[] = []
  let i = 0
  while (i < lines.length) {
    if (keep[i]) {
      const run: DiffLine[] = []
      while (i < lines.length && keep[i]) run.push(lines[i++])
      chunks.push({ type: 'lines', lines: run })
    } else {
      let count = 0
      while (i < lines.length && !keep[i]) {
        count++
        i++
      }
      chunks.push({ type: 'gap', count })
    }
  }
  return chunks
}

export function stats(lines: DiffLine[]): { added: number; removed: number } {
  return {
    added: lines.filter((l) => l.kind === 'add').length,
    removed: lines.filter((l) => l.kind === 'del').length,
  }
}
