// Knob expression evaluator. Mirrors the server grammar (ALGORITHMS.md): numbers, `x`,
// + - * /, parentheses, and lerp(a, b, t), min(...), max(...). Used to preview how a knob
// value resolves into signal weights. The server remains the source of truth.

export class ExprError extends Error {}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) {
      i++
    } else if (/[0-9.]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.]/.test(src[j])) j++
      const v = Number(src.slice(i, j))
      if (Number.isNaN(v)) throw new ExprError(`bad number "${src.slice(i, j)}"`)
      out.push({ t: 'num', v })
      i = j
    } else if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++
      out.push({ t: 'id', v: src.slice(i, j) })
      i = j
    } else if ('+-*/(),'.includes(c)) {
      out.push({ t: 'op', v: c })
      i++
    } else {
      throw new ExprError(`unexpected "${c}"`)
    }
  }
  return out
}

type Node = (x: number) => number

const FUNCS: Record<string, { min: number; max: number; fn: (a: number[]) => number }> = {
  lerp: { min: 3, max: 3, fn: ([a, b, t]) => a + (b - a) * t },
  min: { min: 1, max: 8, fn: (a) => Math.min(...a) },
  max: { min: 1, max: 8, fn: (a) => Math.max(...a) },
}

export function compile(src: string): (x: number) => number {
  const toks = tokenize(src)
  let p = 0
  const peek = () => toks[p]
  const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v

  function expr(): Node {
    let left = term()
    while (isOp('+') || isOp('-')) {
      const op = toks[p++].v
      const l = left
      const r = term()
      left = op === '+' ? (x) => l(x) + r(x) : (x) => l(x) - r(x)
    }
    return left
  }
  function term(): Node {
    let left = unary()
    while (isOp('*') || isOp('/')) {
      const op = toks[p++].v
      const l = left
      const r = unary()
      left =
        op === '*'
          ? (x) => l(x) * r(x)
          : (x) => {
              const d = r(x)
              return d === 0 ? 0 : l(x) / d
            }
    }
    return left
  }
  function unary(): Node {
    if (isOp('-')) {
      p++
      const n = unary()
      return (x) => -n(x)
    }
    return primary()
  }
  function primary(): Node {
    const tk = toks[p++]
    if (!tk) throw new ExprError('unexpected end of expression')
    if (tk.t === 'num') {
      const v = tk.v
      return () => v
    }
    if (tk.t === 'id') {
      if (isOp('(')) {
        p++
        const f = FUNCS[tk.v]
        if (!f) throw new ExprError(`unknown function "${tk.v}"`)
        const args: Node[] = []
        if (!isOp(')')) {
          args.push(expr())
          while (isOp(',')) {
            p++
            args.push(expr())
          }
        }
        if (!isOp(')')) throw new ExprError('missing ")"')
        p++
        if (args.length < f.min || args.length > f.max)
          throw new ExprError(`${tk.v}() takes ${f.min === f.max ? f.min : `${f.min}-${f.max}`} arguments`)
        return (x) => f.fn(args.map((a) => a(x)))
      }
      if (tk.v === 'x') return (x) => x
      throw new ExprError(`unknown name "${tk.v}" (only x is available)`)
    }
    if (tk.v === '(') {
      const n = expr()
      if (!isOp(')')) throw new ExprError('missing ")"')
      p++
      return n
    }
    throw new ExprError(`unexpected "${tk.v}"`)
  }

  const root = expr()
  if (p < toks.length) throw new ExprError(`unexpected "${toks[p].v}"`)
  return root
}
