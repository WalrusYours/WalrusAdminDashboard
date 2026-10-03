import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import type { SchemaVersion, Verdict } from '../api/types'
import { Badge, Button, Card, Empty, Notice, PageHeader, cx, timeAgo } from '../components/ui'
import { GraphDialog } from '../components/SchemaGraph'
import { YamlEditor } from '../components/YamlEditor'
import { useApp } from '../context/appContext'
import { useDraft } from '../context/draftContext'
import { usePublish } from '../context/usePublish'

const VERDICT_TONE: Record<Verdict, 'neutral' | 'ok' | 'warn'> = { none: 'neutral', additive: 'ok', breaking: 'warn' }

export function SchemaPage() {
  const { api } = useApp()
  const { active, text, setText, dirty, discard } = useDraft()
  const [history, setHistory] = useState<SchemaVersion[]>([])
  const [dragging, setDragging] = useState(false)
  const [showGraph, setShowGraph] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => setHistory(await api.schemaHistory()), [api])
  useEffect(() => {
    void loadHistory()
  }, [loadHistory, active?.version])

  const { errors, diff, result, busy, confirm, setConfirm, needsConfirm, canApply, run } = usePublish(loadHistory)

  async function readFile(file: File | undefined) {
    if (!file) return
    setText((await file.text()).replace(/^﻿/, '').replace(/\r\n?/g, '\n'))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void readFile(e.dataTransfer.files[0])
  }

  return (
    <>
      <PageHeader
        title="Schema"
        subtitle="Upload or edit the YAML schema. Validation runs as you type; the server re-checks on dry run and apply."
        action={
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".yml,.yaml,text/yaml"
              className="hidden"
              onChange={(e) => void readFile(e.target.files?.[0])}
            />
            <Button onClick={() => fileRef.current?.click()}>Upload YAML</Button>
            <Button disabled={!text.trim()} onClick={() => setShowGraph(true)}>
              View graph
            </Button>
            <Button variant="ghost" disabled={!dirty} onClick={discard}>
              Discard changes
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card
          title={
            <span className="flex items-center gap-2">
              schema.yml {dirty && <Badge tone="accent">edited</Badge>}
              {active && <Badge>active v{active.version}</Badge>}
            </span>
          }
        >
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx('relative rounded-lg', dragging && 'ring-2 ring-accent')}
          >
            <YamlEditor value={text} onChange={setText} placeholder="Paste a schema here, or drop a .yml file." />
            {dragging && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-canvas/85 text-sm text-accent">
                Drop a .yml file to load it
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Checks">
            {!text.trim() ? (
              <Empty>Nothing to check yet.</Empty>
            ) : errors.length === 0 ? (
              <Notice tone="ok" title="Valid">
                Structure, references, identifiers and knob expressions all check out.
              </Notice>
            ) : (
              <div className="space-y-2">
                <Notice tone="bad" title={`${errors.length} problem${errors.length > 1 ? 's' : ''}`} />
                <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                  {errors.map((e, i) => (
                    <li key={i} className="rounded-lg border border-line bg-raised px-3 py-2">
                      {e.path && <div className="font-mono text-xs text-accent">{e.path}</div>}
                      <div className="text-muted">{e.message}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result && result.errors.length > 0 && (
              <div className="mt-4 space-y-2">
                <Notice tone="bad" title={`Engine: ${result.errors.length} problem${result.errors.length > 1 ? 's' : ''}`} />
                <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                  {result.errors.map((e, i) => (
                    <li key={i} className="rounded-lg border border-line bg-raised px-3 py-2">
                      {e.path && <div className="font-mono text-xs text-accent">{e.path}</div>}
                      <div className="text-muted">{e.message}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card
            title="Changes vs active"
            action={diff && <Badge tone={VERDICT_TONE[diff.verdict]}>{diff.verdict}</Badge>}
          >
            {!diff || diff.changes.length === 0 ? (
              <p className="text-sm text-faint">No differences from the active version.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto font-mono text-xs">
                {diff.changes.slice(0, 60).map((c, i) => (
                  <li
                    key={i}
                    className={cx(c.startsWith('+') && 'text-ok', c.startsWith('-') && 'text-bad', c.startsWith('~') && 'text-warn')}
                  >
                    {c}
                  </li>
                ))}
                {diff.changes.length > 60 && <li className="text-faint">… {diff.changes.length - 60} more</li>}
              </ul>
            )}
            {needsConfirm && (
              <label className="mt-4 flex items-start gap-2 text-sm text-muted">
                <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1 accent-accent" />
                This removes or retypes something. I understand a re-import and re-precompute are required.
              </label>
            )}
          </Card>

          <Card title="Publish">
            <div className="flex gap-2">
              <Button disabled={busy || !text.trim() || errors.length > 0} onClick={() => void run(true)}>
                Dry run
              </Button>
              <Button variant="primary" disabled={busy || !canApply} onClick={() => void run(false)}>
                {busy ? 'Working…' : 'Apply'}
              </Button>
            </div>
            {result && (
              <div className="mt-4">
                <Notice tone={result.ok ? 'ok' : result.needsConfirm ? 'warn' : 'bad'} title={result.ok ? 'Server accepted' : 'Server refused'}>
                  {result.message}
                </Notice>
              </div>
            )}
          </Card>
        </div>
      </div>

      {showGraph && <GraphDialog onClose={() => setShowGraph(false)} />}

      <Card title="Version history" className="mt-6">
        {history.length === 0 ? (
          <Empty>No versions yet. Apply a schema to create version 1.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <Badge tone="accent">v{v.version}</Badge>
                <Badge tone={VERDICT_TONE[v.verdict]}>{v.verdict}</Badge>
                <span className="font-mono text-xs text-faint">{v.hash.slice(0, 12)}</span>
                <span className="text-muted">
                  {v.author} · {timeAgo(v.at)}
                </span>
                <Button variant="ghost" className="ml-auto" onClick={() => setText(v.yaml)}>
                  Load into editor
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
