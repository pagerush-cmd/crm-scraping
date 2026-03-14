'use client'

import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertCircle, CheckCircle2, Download,
  Loader2, MapPin, MoreHorizontal,
  Pencil, Plus, Search, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'

import type { Campaign } from '@/types/campaign'
import { Badge }  from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { NewCampaignModal }    from './new-campaign-modal'
import { EditCampaignModal }   from './edit-campaign-modal'
import { DeleteCampaignDialog } from './delete-campaign-dialog'

// ─── status config ────────────────────────────────────────────────────────────

const CAMPAIGN_STATUS: Record<string, { label: string; className: string }> = {
  running:   { label: 'Rodando',   className: 'bg-green-100 text-green-700 border-transparent' },
  paused:    { label: 'Pausada',   className: 'bg-amber-100 text-amber-700 border-transparent' },
  completed: { label: 'Concluída', className: 'bg-blue-100 text-blue-700 border-transparent' },
  draft:     { label: 'Rascunho',  className: 'bg-gray-100 text-gray-600 border-transparent' },
}

// ─── tipos SSE ────────────────────────────────────────────────────────────────

interface ScrapeEvent {
  type:          'status' | 'queries' | 'query' | 'found' | 'saved' | 'query_error' | 'error' | 'done'
  message?:      string
  query?:        string
  queries?:      string[]
  count?:        number
  saved?:        number
  duplicates?:   number
  total_saved?:  number
  error?:        string
  total_leads_saved?: number
  total_duplicates?:  number
}

interface ScrapeState {
  campaign:    Campaign
  events:      ScrapeEvent[]
  totalSaved:  number
  done:        boolean
}

// ─── modal de confirmação ─────────────────────────────────────────────────────

function ScrapeConfirmModal({
  campaign, open, onClose, onConfirm,
}: {
  campaign: Campaign
  open:     boolean
  onClose:  () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Coletar leads</DialogTitle>
          <DialogDescription className="text-xs">
            Isso vai buscar empresas no Google Maps e salvar na campanha.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-muted/50 p-4 flex flex-col gap-2">
          <Row label="Campanha" value={campaign.name} />
          <Row label="Cidade"   value={campaign.city} />
          <Row label="Nicho"    value={campaign.niche} />
        </div>

        <p className="text-[11px] text-muted-foreground">
          A IA vai gerar 5 queries de busca e consultar o Google Maps via HasData API.
          Leads duplicados (mesmo telefone) serão ignorados automaticamente.
        </p>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button size="sm" className="flex-1 gap-1.5" onClick={onConfirm}>
            <Search className="h-3.5 w-3.5" />
            Iniciar coleta
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold text-foreground">{value}</span>
    </div>
  )
}

// ─── painel de progresso ──────────────────────────────────────────────────────

function ScrapePanel({ state, onClose }: { state: ScrapeState; onClose: () => void }) {
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [state.events])

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-120 flex-col border-l bg-background shadow-2xl">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {state.done ? 'Coleta concluída' : 'Coletando leads…'}
          </p>
          <p className="truncate text-xs text-muted-foreground">{state.campaign.name}</p>
        </div>
        {state.done && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Feed */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {state.events.length === 0 && !state.done && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Iniciando coleta…
          </div>
        )}

        {state.events.map((ev, i) => {
          if (ev.type === 'status') return (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              {ev.message}
            </div>
          )

          if (ev.type === 'queries') return (
            <div key={i} className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Queries geradas</p>
              {ev.queries?.map((q, qi) => (
                <div key={qi} className="flex items-center gap-1.5 text-xs">
                  <MapPin className="h-3 w-3 shrink-0 text-primary" />
                  <span className="text-foreground">{q}</span>
                </div>
              ))}
            </div>
          )

          if (ev.type === 'query') return (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
              <span>Buscando: <span className="font-medium text-foreground">{ev.query}</span></span>
            </div>
          )

          if (ev.type === 'found') return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <Search className="h-3 w-3 shrink-0 text-blue-500" />
              <span className="text-muted-foreground">
                {ev.query} → <span className="font-semibold text-foreground">{ev.count} resultados</span>
              </span>
            </div>
          )

          if (ev.type === 'saved') return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
              <span className="text-muted-foreground">
                Salvos: <span className="font-semibold text-green-600">{ev.saved} novos</span>
                {(ev.duplicates ?? 0) > 0 && (
                  <span className="ml-1 text-muted-foreground/70">({ev.duplicates} duplicados)</span>
                )}
                <span className="ml-1 text-muted-foreground/70">· total {ev.total_saved}</span>
              </span>
            </div>
          )

          if (ev.type === 'query_error' || ev.type === 'error') return (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs">
                <AlertCircle className="h-3 w-3 shrink-0 text-red-500" />
                <span className="text-red-600 font-medium">{ev.query ?? 'Erro'}</span>
              </div>
              <p className="ml-5 text-[11px] text-red-500">{ev.error}</p>
            </div>
          )

          return null
        })}
      </div>

      {/* Footer quando concluído */}
      {state.done && (
        <div className="shrink-0 border-t px-4 py-4 flex flex-col gap-3">
          <div className="rounded-xl bg-muted/50 p-3 flex flex-col gap-1.5">
            <Row label="Leads salvos"    value={String(state.totalSaved)} />
          </div>
          <Button size="sm" className="w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      )}

      {/* Barra de progresso indeterminada (enquanto rodando) */}
      {!state.done && (
        <div className="shrink-0 border-t px-4 py-3">
          <Progress value={undefined} className="h-1.5 animate-pulse" />
          <p className="mt-1.5 text-[10px] text-center text-muted-foreground">
            {state.totalSaved} leads salvos até agora…
          </p>
        </div>
      )}
    </div>
  )
}

// ─── component principal ──────────────────────────────────────────────────────

interface CampaignsTableProps {
  initialCampaigns: Campaign[]
}

export function CampaignsTable({ initialCampaigns }: CampaignsTableProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns)

  // modal / dialog state
  const [newOpen,         setNewOpen]         = useState(false)
  const [editCampaign,    setEditCampaign]    = useState<Campaign | null>(null)
  const [deleteCampaign,  setDeleteCampaign]  = useState<Campaign | null>(null)
  const [scrapeTarget,    setScrapeTarget]    = useState<Campaign | null>(null)
  const [scrapeState,     setScrapeState]     = useState<ScrapeState | null>(null)
  const [backupLoadingId, setBackupLoadingId] = useState<string | null>(null)

  // ── CRUD handlers ─────────────────────────────────────────────────────────────

  function handleCreated(campaign: Campaign) {
    setCampaigns((prev) => [campaign, ...prev])
  }

  function handleUpdated(campaign: Campaign) {
    setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? campaign : c)))
  }

  function handleDeleted(id: string) {
    setCampaigns((prev) => prev.filter((c) => c.id !== id))
  }

  // ── Scraping SSE ─────────────────────────────────────────────────────────────

  async function handleStartScrape(campaign: Campaign) {
    setScrapeTarget(null)
    setScrapeState({ campaign, events: [], totalSaved: 0, done: false })

    try {
      const res = await fetch('/api/scrape/run', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ campaign_id: campaign.id }),
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
            const ev: ScrapeEvent = JSON.parse(dataLine.slice(6))
            setScrapeState((prev) => {
              if (!prev) return prev
              if (ev.type === 'done') {
                return {
                  ...prev,
                  done:       true,
                  totalSaved: ev.total_leads_saved ?? prev.totalSaved,
                  events:     [...prev.events, ev],
                }
              }
              if (ev.type === 'saved') {
                return {
                  ...prev,
                  totalSaved: ev.total_saved ?? prev.totalSaved,
                  events:     [...prev.events, ev],
                }
              }
              return { ...prev, events: [...prev.events, ev] }
            })
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erro na coleta: ${msg}`)
      setScrapeState((prev) => prev ? { ...prev, done: true } : null)
    }
  }

  function handleClosePanel() {
    setScrapeState(null)
  }

  // ── Backup ────────────────────────────────────────────────────────────────────

  async function handleBackup(campaign: Campaign) {
    setBackupLoadingId(campaign.id)
    try {
      const res = await fetch(`/api/campaigns/backup?campaign_id=${campaign.id}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error((data as { error?: string }).error ?? 'Erro ao gerar backup')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `backup_${campaign.name}_${format(new Date(), 'yyyy-MM-dd')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup baixado com sucesso!')
    } catch {
      toast.error('Erro ao baixar backup')
    } finally {
      setBackupLoadingId(null)
    }
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">Todas as Campanhas</CardTitle>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {campaigns.length} {campaigns.length === 1 ? 'campanha' : 'campanhas'}
              </span>
              <Button size="sm" className="gap-2" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" />
                Nova campanha
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className={campaigns.length === 0 ? undefined : 'p-0'}>
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-foreground">Nenhuma campanha cadastrada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Clique em &quot;Nova campanha&quot; para começar.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Nome</TableHead>
                  <TableHead className="hidden sm:table-cell">Cidade</TableHead>
                  <TableHead className="hidden md:table-cell">Nicho</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Limite/dia</TableHead>
                  <TableHead className="hidden lg:table-cell">Criada em</TableHead>
                  <TableHead className="pr-4 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const statusCfg   = CAMPAIGN_STATUS[campaign.status] ?? { label: campaign.status, className: '' }
                  const isScraping  = scrapeState?.campaign.id === campaign.id && !scrapeState.done
                  const isBackingUp = backupLoadingId === campaign.id

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell className="pl-6">
                        <span className="block max-w-35 truncate font-medium sm:max-w-50">
                          {campaign.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground sm:hidden">
                          {campaign.city}
                        </span>
                      </TableCell>

                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {campaign.city}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {campaign.niche}
                      </TableCell>

                      <TableCell>
                        <Badge variant="secondary" className={`rounded-lg text-xs ${statusCfg.className}`}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>

                      <TableCell className="hidden text-muted-foreground md:table-cell">
                        {campaign.daily_limit.toLocaleString('pt-BR')}
                      </TableCell>

                      <TableCell className="hidden text-muted-foreground lg:table-cell">
                        {format(new Date(campaign.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>

                      <TableCell className="pr-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Coletar leads */}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isScraping || (!!scrapeState && !scrapeState.done)}
                            onClick={() => setScrapeTarget(campaign)}
                            className="gap-1.5"
                          >
                            {isScraping
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Coletando…</>
                              : <><Search className="h-3.5 w-3.5" /><span className="hidden sm:inline">Coletar leads</span></>
                            }
                          </Button>

                          {/* Menu secundário */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                disabled={isBackingUp}
                              >
                                {isBackingUp
                                  ? <Loader2 className="h-4 w-4 animate-spin" />
                                  : <MoreHorizontal className="h-4 w-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditCampaign(campaign)}>
                                <Pencil className="h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleBackup(campaign)}>
                                <Download className="h-4 w-4" />
                                Baixar backup
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() => setDeleteCampaign(campaign)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Deletar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Modais ──────────────────────────────────────────────────────────────── */}
      <NewCampaignModal
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={handleCreated}
      />
      <EditCampaignModal
        campaign={editCampaign}
        open={editCampaign !== null}
        onOpenChange={(o) => { if (!o) setEditCampaign(null) }}
        onUpdated={handleUpdated}
      />
      <DeleteCampaignDialog
        campaign={deleteCampaign}
        open={deleteCampaign !== null}
        onOpenChange={(o) => { if (!o) setDeleteCampaign(null) }}
        onDeleted={handleDeleted}
      />

      {/* Modal de confirmação de coleta */}
      {scrapeTarget && (
        <ScrapeConfirmModal
          campaign={scrapeTarget}
          open={true}
          onClose={() => setScrapeTarget(null)}
          onConfirm={() => handleStartScrape(scrapeTarget)}
        />
      )}

      {/* Painel de progresso */}
      {scrapeState && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20"
            onClick={scrapeState.done ? handleClosePanel : undefined}
          />
          <ScrapePanel state={scrapeState} onClose={handleClosePanel} />
        </>
      )}
    </>
  )
}
