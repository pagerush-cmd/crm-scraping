'use client'

import { useState } from 'react'
import { Loader2, Zap, Image, Trophy, Clock, Hash, ArrowRight } from 'lucide-react'

import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Badge }    from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

// ─── tipos ────────────────────────────────────────────────────────────────────

interface ApproachResult {
  input_tokens:  number
  output_tokens: number
  total_tokens:  number
  cost_usd:      number
  time_ms:       number
  fetch_ms?:     number
  result:        unknown
}

interface CompareResponse {
  ok:                  boolean
  error?:              string
  lead_id:             string
  url:                 ApproachResult
  base64:              ApproachResult
  winner:              'url' | 'base64'
  token_difference:    number
  cost_difference_usd: number
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('pt-BR') }

function fmtUsd(n: number) {
  // Mostrar em notação científica-like para valores muito pequenos
  if (n < 0.0001) return `$${n.toFixed(7)}`
  if (n < 0.01)   return `$${n.toFixed(5)}`
  return `$${n.toFixed(4)}`
}

function ScoreBar({ value }: { value: number }) {
  const pct   = Math.round(value * 10)
  const color = value >= 7 ? 'bg-green-500' : value >= 4 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-right text-xs font-bold tabular-nums">{value}</span>
    </div>
  )
}

function LabelBadge({ label }: { label: string }) {
  const cfg: Record<string, string> = {
    fraco:  'bg-red-100 text-red-700',
    medio:  'bg-amber-100 text-amber-700',
    forte:  'bg-green-100 text-green-700',
  }
  return (
    <Badge variant="secondary" className={`rounded-lg text-xs ${cfg[label] ?? ''}`}>
      {label}
    </Badge>
  )
}

interface ResultCardProps {
  title:     string
  icon:      React.ReactNode
  data:      ApproachResult
  isWinner:  boolean
}

function ResultCard({ title, icon, data, isWinner }: ResultCardProps) {
  const parsed = data.result as { design_score?: number; design_label?: string; notes?: string } | null

  return (
    <Card className={`rounded-2xl shadow-sm transition-all ${isWinner ? 'ring-2 ring-green-500' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          </div>
          {isWinner && (
            <Badge className="gap-1 rounded-lg bg-green-500 text-xs text-white hover:bg-green-600">
              <Trophy className="h-3 w-3" /> Vencedor
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">

        {/* Métricas */}
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center">
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">
              {fmt(data.input_tokens)}
            </p>
            <p className="text-[10px] text-muted-foreground">Input tokens</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">
              {fmt(data.output_tokens)}
            </p>
            <p className="text-[10px] text-muted-foreground">Output tokens</p>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-foreground">
              {fmt(data.total_tokens)}
            </p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
        </div>

        {/* Custo */}
        <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
            💵 Custo estimado
          </span>
          <span className="font-bold tabular-nums text-emerald-800">
            {fmtUsd(data.cost_usd)}
          </span>
        </div>

        {/* Tempo */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-muted/50 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3" /> Tempo total
            </span>
            <span className="font-bold tabular-nums">{fmt(data.time_ms)} ms</span>
          </div>
          {data.fetch_ms !== undefined && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground pl-4">↳ download imagem</span>
              <span className="tabular-nums text-muted-foreground">{fmt(data.fetch_ms)} ms</span>
            </div>
          )}
        </div>

        <Separator />

        {/* Resultado da análise */}
        {parsed && typeof parsed === 'object' ? (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Resultado da análise
            </p>

            {parsed.design_score != null && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Design score</p>
                <ScoreBar value={parsed.design_score} />
              </div>
            )}

            {parsed.design_label && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">Label</p>
                <LabelBadge label={parsed.design_label} />
              </div>
            )}

            {parsed.notes && (
              <p className="rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-foreground italic">
                "{parsed.notes}"
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-muted/60 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Raw output
            </p>
            <pre className="text-xs text-foreground whitespace-pre-wrap break-all">
              {JSON.stringify(data.result, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function CompareCostPage() {
  const [leadId,  setLeadId]  = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<CompareResponse | null>(null)
  const [error,   setError]   = useState<string | null>(null)

  async function handleRun() {
    if (!leadId.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res  = await fetch('/api/test/compare-cost', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lead_id: leadId.trim() }),
      })
      const data: CompareResponse = await res.json()
      if (!data.ok) { setError(data.error ?? 'Erro desconhecido'); return }
      setResult(data)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 p-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Comparar custo — URL vs Base64
          </h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Compara tokens e latência entre enviar a imagem como URL direta ou como base64 para o Claude API
          {' '}(<span className="font-mono text-xs">claude-sonnet-4-6</span>).
        </p>
      </div>

      {/* Input */}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 flex flex-col gap-2">
              <Label htmlFor="lead-id" className="text-sm font-medium">
                Lead ID
              </Label>
              <Input
                id="lead-id"
                placeholder="ex: 3f2a8b1c-..."
                value={leadId}
                onChange={(e) => setLeadId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRun() }}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                O lead precisa ter <span className="font-mono">screenshot_url</span> preenchido em <span className="font-mono">lead_enrichment</span>.
              </p>
            </div>
            <Button
              onClick={handleRun}
              disabled={loading || !leadId.trim()}
              className="gap-2 shrink-0"
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Analisando…</>
                : <><ArrowRight className="h-4 w-4" /> Rodar comparação</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Erro */}
      {error && (
        <Card className="rounded-2xl border-red-200 bg-red-50 shadow-sm">
          <CardContent className="pt-5">
            <p className="text-sm font-medium text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Resultado */}
      {result && (
        <div className="flex flex-col gap-6">

          {/* Resumo */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                Resumo
              </CardTitle>
              <CardDescription className="font-mono text-xs">{result.lead_id}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-lg font-bold text-foreground">
                    {result.winner === 'url' ? '🔗 URL' : '📦 Base64'}
                  </p>
                  <p className="text-xs text-muted-foreground">Vencedor</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-base font-bold text-foreground tabular-nums">
                    {fmt(result.token_difference)}
                  </p>
                  <p className="text-xs text-muted-foreground">Tokens a mais</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-center">
                  <p className="text-base font-bold tabular-nums text-emerald-700">
                    {fmtUsd(result.url.cost_usd)}
                  </p>
                  <p className="text-xs text-emerald-600">Custo URL</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-center">
                  <p className="text-base font-bold tabular-nums text-emerald-700">
                    {fmtUsd(result.base64.cost_usd)}
                  </p>
                  <p className="text-xs text-emerald-600">Custo Base64</p>
                </div>
              </div>

              {/* Diferença de custo */}
              <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
                <span className="text-emerald-700">
                  💰 <span className="font-medium">{result.winner === 'url' ? 'URL' : 'Base64'}</span> é mais barato por chamada
                </span>
                <span className="font-bold tabular-nums text-emerald-800">
                  {fmtUsd(result.cost_difference_usd)} de diferença
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Cards lado a lado */}
          <div className="grid gap-4 sm:grid-cols-2">
            <ResultCard
              title="Abordagem A — URL direta"
              icon={<Image className="h-4 w-4 text-sky-500" />}
              data={result.url}
              isWinner={result.winner === 'url'}
            />
            <ResultCard
              title="Abordagem B — Base64"
              icon={<Hash className="h-4 w-4 text-violet-500" />}
              data={result.base64}
              isWinner={result.winner === 'base64'}
            />
          </div>

        </div>
      )}
    </div>
  )
}
