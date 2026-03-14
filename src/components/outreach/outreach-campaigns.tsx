'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, ExternalLink, Loader2,
  Send, TrendingUp, Users, XCircle, X,
} from 'lucide-react'
import { toast } from 'sonner'

import type { Campaign } from '@/types/campaign'
import { Badge }  from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Progress }  from '@/components/ui/progress'

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface CampaignOutreachStats {
  campaign:         Campaign
  total:            number
  contacted:        number
  responded:        number
  closed:           number
  revenue:          number
  outreachNew:      number   // outreach_status = 'new' AND phone IS NOT NULL
  firstNewLeadName: string   // nome do primeiro lead elegível para disparo
}

export interface OutreachSettings {
  daily_limit:  string
  active_hours: string
  delay_min:    string
  delay_max:    string
}

interface DispatchEvent {
  type:             'progress' | 'sent' | 'error' | 'done'
  company_name?:    string
  message_preview?: string
  error?:           string
  total_sent?:      number
  total_errors?:    number
}

interface DispatchState {
  campaign:  CampaignOutreachStats
  events:    DispatchEvent[]
  sent:      number
  errors:    number
  total:     number
  done:      boolean
}

// ─── modal de confirmação ─────────────────────────────────────────────────────

interface StartModalProps {
  stats:            CampaignOutreachStats
  outreachSettings: OutreachSettings
  open:             boolean
  onClose:          () => void
  onConfirm:        () => void
}

function StartModal({ stats, outreachSettings, open, onClose, onConfirm }: StartModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Iniciar disparo</DialogTitle>
          <DialogDescription className="truncate text-xs">
            {stats.campaign.name} · {stats.campaign.city} · {stats.campaign.niche}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          {/* Resumo */}
          <div className="rounded-xl bg-muted/50 p-4 flex flex-col gap-2">
            <InfoRow
              label="Leads a disparar"
              value={`${stats.outreachNew} (com telefone, status new)`}
              highlight={stats.outreachNew > 0}
            />
            <InfoRow label="Já contatados"     value={String(stats.contacted)} />
            <InfoRow label="Total na campanha" value={String(stats.total)} />
          </div>

          {/* Limites */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Configurações</p>
            <div className="rounded-xl border px-3 py-2 flex flex-col gap-1.5">
              <InfoRow label="Limite diário"   value={outreachSettings.daily_limit  ? `${outreachSettings.daily_limit} msgs` : '—'} />
              <InfoRow label="Horário"          value={outreachSettings.active_hours || '—'} />
              <InfoRow label="Delay entre msgs" value={
                outreachSettings.delay_min && outreachSettings.delay_max
                  ? `${outreachSettings.delay_min}s – ${outreachSettings.delay_max}s`
                  : '—'
              } />
            </div>
            {(!outreachSettings.daily_limit || !outreachSettings.active_hours) && (
              <p className="text-[11px] text-amber-600">
                ⚠️ Algumas configurações estão vazias.{' '}
                <Link href="/settings" className="underline" onClick={onClose}>Configurar agora</Link>
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            className="flex-1 gap-1.5"
            onClick={onConfirm}
            disabled={stats.outreachNew === 0}
          >
            <Send className="h-3.5 w-3.5" />
            Confirmar e iniciar
          </Button>
        </div>
        {stats.outreachNew === 0 && (
          <p className="text-center text-xs text-muted-foreground">
            Nenhum lead com <span className="font-mono">outreach_status = new</span> e telefone.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-semibold ${highlight ? 'text-primary' : 'text-foreground'}`}>{value}</span>
    </div>
  )
}

// ─── painel de progresso ──────────────────────────────────────────────────────

function DispatchPanel({ state, onClose }: { state: DispatchState; onClose: () => void }) {
  const feedRef = useRef<HTMLDivElement>(null)
  const pct     = state.total > 0 ? Math.round(((state.sent + state.errors) / state.total) * 100) : 0

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [state.events])

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-120 flex-col border-l bg-background shadow-2xl">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {state.done ? 'Disparo concluído' : 'Disparando…'}
          </p>
          <p className="truncate text-xs text-muted-foreground">{state.campaign.campaign.name}</p>
        </div>
        {state.done && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Barra de progresso */}
      <div className="shrink-0 border-b px-4 py-3 flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{state.sent + state.errors} de {state.total} leads</span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="h-2" />
        <div className="flex gap-3 text-xs">
          <span className="text-green-600">✅ {state.sent} enviados</span>
          {state.errors > 0 && <span className="text-red-600">❌ {state.errors} erros</span>}
        </div>
      </div>

      {/* Feed em tempo real */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {state.events.length === 0 && !state.done && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Iniciando disparo…
          </div>
        )}

        {state.events.map((ev, i) => {
          if (ev.type === 'progress') return (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              <span>Enviando para <span className="font-medium text-foreground">{ev.company_name}</span>…</span>
            </div>
          )
          if (ev.type === 'sent') return (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                <span className="font-medium text-foreground">{ev.company_name}</span>
              </div>
              {ev.message_preview && (
                <p className="ml-5 text-[11px] text-muted-foreground">
                  &ldquo;{ev.message_preview}{ev.message_preview.length >= 80 ? '…' : ''}&rdquo;
                </p>
              )}
            </div>
          )
          if (ev.type === 'error') return (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs">
                <XCircle className="h-3 w-3 shrink-0 text-red-500" />
                <span className="font-medium text-foreground">{ev.company_name || 'Erro geral'}</span>
              </div>
              <p className="ml-5 text-[11px] text-red-600">{ev.error}</p>
            </div>
          )
          return null
        })}
      </div>

      {/* Footer — concluído */}
      {state.done && (
        <div className="shrink-0 border-t px-4 py-3 flex flex-col gap-3">
          <div className="rounded-xl bg-muted/50 p-3 flex flex-col gap-1">
            <InfoRow label="Enviados com sucesso" value={String(state.sent)} />
            <InfoRow label="Erros"                value={String(state.errors)} />
          </div>
          <Button size="sm" className="w-full gap-1.5" asChild>
            <Link href={`/outreach/${state.campaign.campaign.id}`}>
              <ExternalLink className="h-4 w-4" />
              Ver pipeline
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── component principal ──────────────────────────────────────────────────────

interface OutreachCampaignsProps {
  stats:            CampaignOutreachStats[]
  outreachSettings: OutreachSettings
}

export function OutreachCampaigns({ stats, outreachSettings }: OutreachCampaignsProps) {
  const router = useRouter()

  const [modalStats,    setModalStats]    = useState<CampaignOutreachStats | null>(null)
  const [dispatchState, setDispatchState] = useState<DispatchState | null>(null)

  async function startDispatch(campaign: CampaignOutreachStats) {
    setModalStats(null)
    setDispatchState({ campaign, events: [], sent: 0, errors: 0, total: campaign.outreachNew, done: false })

    try {
      const res = await fetch('/api/outreach/start', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaign.campaign.id,
        }),
      })

      if (!res.body) throw new Error('Sem resposta do servidor')

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const dataLine = part.split('\n').find((l) => l.startsWith('data: '))
          if (!dataLine) continue
          try {
            const ev: DispatchEvent = JSON.parse(dataLine.slice(6))
            setDispatchState((prev) => {
              if (!prev) return prev
              if (ev.type === 'done') {
                return { ...prev, done: true, sent: ev.total_sent ?? prev.sent, errors: ev.total_errors ?? prev.errors }
              }
              if (ev.type === 'sent') {
                return { ...prev, events: [...prev.events, ev], sent: prev.sent + 1 }
              }
              if (ev.type === 'error' && ev.company_name) {
                return { ...prev, events: [...prev.events, ev], errors: prev.errors + 1 }
              }
              // progress or other
              return { ...prev, events: [...prev.events, ev] }
            })
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erro no disparo: ${msg}`)
      setDispatchState((prev) => prev ? { ...prev, done: true } : null)
    }
  }

  function handleClosePanel() {
    setDispatchState(null)
    router.refresh()
  }

  return (
    <>
      <div className="flex flex-col gap-6">

        {/* ── Cards ─────────────────────────────────────────────────────────── */}
        {stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border bg-card py-20 text-center">
            <Send className="mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Nenhuma campanha cadastrada</p>
            <p className="mt-1 text-xs text-muted-foreground">Crie uma campanha para começar os disparos.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {stats.map((s) => {
              const { campaign, total, contacted, responded, closed, revenue, outreachNew } = s

              return (
                <Card key={campaign.id} className="rounded-2xl shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-sm font-semibold">{campaign.name}</CardTitle>
                        <CardDescription className="mt-0.5 truncate text-xs">
                          {campaign.city} · {campaign.niche}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="shrink-0 rounded-lg text-xs bg-muted text-muted-foreground border-transparent">
                        {campaign.status}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-2">
                      <Metric label="Total leads"  value={total.toLocaleString('pt-BR')}     icon={<Users className="h-3.5 w-3.5" />} />
                      <Metric label="Contatados"   value={contacted.toLocaleString('pt-BR')} color="text-blue-600" />
                      <Metric label="Responderam"  value={responded.toLocaleString('pt-BR')} color="text-yellow-600" />
                      <Metric label="Fechados"     value={closed.toLocaleString('pt-BR')}    color="text-green-600" />
                    </div>

                    <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        <TrendingUp className="h-3.5 w-3.5" />
                        Receita estimada
                      </span>
                      <span className="text-sm font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                        {revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" asChild>
                        <Link href={`/outreach/${campaign.id}`}>
                          <ExternalLink className="h-4 w-4" />
                          Ver pipeline
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 gap-1.5"
                        onClick={() => setModalStats(s)}
                        disabled={!!dispatchState && !dispatchState.done}
                      >
                        <Send className="h-4 w-4" />
                        Iniciar disparo
                        {outreachNew > 0 && (
                          <span className="ml-auto rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                            {outreachNew}
                          </span>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal de confirmação */}
      {modalStats && (
        <StartModal
          stats={modalStats}
          outreachSettings={outreachSettings}
          open={true}
          onClose={() => setModalStats(null)}
          onConfirm={() => startDispatch(modalStats)}
        />
      )}

      {/* Painel de progresso */}
      {dispatchState && (
        <>
          {/* Backdrop (clicável apenas quando concluído) */}
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={dispatchState.done ? handleClosePanel : undefined}
          />
          <DispatchPanel state={dispatchState} onClose={handleClosePanel} />
        </>
      )}
    </>
  )
}

// ─── helper ───────────────────────────────────────────────────────────────────

function Metric({ label, value, color = 'text-foreground', icon }: {
  label: string; value: string; color?: string; icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col rounded-xl bg-muted/50 p-2.5 text-center">
      <div className={`flex items-center justify-center gap-1 text-base font-bold tabular-nums ${color}`}>
        {icon}{value}
      </div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
