'use client'

import { useState } from 'react'
import { ExternalLink, Phone, Star, Tag } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface LeadRow {
  id: string
  company_name:  string
  phone:         string | null
  address:       string | null
  website:       string | null
  category:      string | null
  rating:        number | null
  reviews_count: number | null
  enrichment: {
    lead_id:            string
    status:             string
    design_score:       number | null
    tech_score:         number | null
    normalized_website: string | null
    screenshot_url:     string | null
    website_status:     string | null
    design_label:       string | null
    outreach_message:   string | null
    hooks:              Array<{ titulo: string; argumento: string }> | null
    weak_points:        string[] | null
    quick_wins:         string[] | null
  } | null
}

// ─── status badges ────────────────────────────────────────────────────────────

const ENRICH_STATUS: Record<string, { label: string; className: string }> = {
  pending:         { label: 'Pendente',          className: 'bg-amber-100 text-amber-700 border-transparent' },
  screenshot_done: { label: 'Aguard. análise',   className: 'bg-sky-100   text-sky-700   border-transparent' },
  done:            { label: 'Concluído',         className: 'bg-green-100 text-green-700 border-transparent' },
}

function EnrichBadge({ status, websiteStatus }: { status?: string | null; websiteStatus?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>
  if (status === 'done' && websiteStatus === 'unavailable')
    return <Badge variant="secondary" className="rounded-lg text-xs bg-gray-100 text-gray-500 border-transparent">Pág. indisponível</Badge>
  if (status === 'done' && websiteStatus === 'failed')
    return <Badge variant="secondary" className="rounded-lg text-xs bg-orange-100 text-orange-600 border-transparent">Erro técnico</Badge>
  const cfg = ENRICH_STATUS[status] ?? { label: status, className: '' }
  return <Badge variant="secondary" className={`rounded-lg text-xs ${cfg.className}`}>{cfg.label}</Badge>
}

// ─── helpers visuais ──────────────────────────────────────────────────────────

function WebsiteLink({ href }: { href: string | null | undefined }) {
  if (!href) return <span className="text-xs text-muted-foreground">—</span>
  const display = href.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-1 text-primary hover:underline"
    >
      <span className="max-w-45 truncate text-xs">{display}</span>
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  )
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-bold tabular-nums">{value}<span className="text-muted-foreground font-normal">/10</span></span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value * 10}%` }} />
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text).catch(() => {
          const el = document.createElement('textarea')
          el.value = text
          document.body.appendChild(el)
          el.select()
          document.execCommand('copy')
          document.body.removeChild(el)
        })
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className="shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
    >
      {copied ? '✓ Copiado' : 'Copiar'}
    </button>
  )
}

// ─── modal de detalhes do lead ────────────────────────────────────────────────

interface LeadModal {
  lead: LeadRow
}

function LeadDetailDialog({ modal, onClose }: { modal: LeadModal | null; onClose: () => void }) {
  if (!modal) return null
  const { lead } = modal
  const e = lead.enrichment

  const websiteUrl    = e?.normalized_website ?? lead.website
  const screenshotUrl = e?.screenshot_url
  const hasAnalysis   = e && (e.design_score != null || e.weak_points?.length)
  const isUnavailable = e?.website_status === 'unavailable'
  const isFailed      = e?.website_status === 'failed'
  const isNoSite      = e?.website_status === 'no_site'

  return (
    <Dialog open={!!modal} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-5xl p-0 overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold leading-tight">
                {lead.company_name}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {websiteUrl && (
                    <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      {websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                  {lead.phone && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />{lead.phone}
                    </span>
                  )}
                  {lead.category && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Tag className="h-3 w-3" />{lead.category}
                    </span>
                  )}
                  {lead.rating != null && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {lead.rating}
                      {lead.reviews_count != null && (
                        <span className="text-muted-foreground/60">({lead.reviews_count})</span>
                      )}
                    </span>
                  )}
                </div>
              </DialogDescription>
            </div>
            <EnrichBadge status={e?.status} websiteStatus={e?.website_status} />
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden flex-col sm:flex-row min-h-0">

          {/* Coluna esquerda — screenshot */}
          <div className="sm:w-[45%] overflow-y-auto border-b sm:border-b-0 sm:border-r bg-muted/20">
            {screenshotUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={screenshotUrl} alt={`Screenshot de ${lead.company_name}`} className="w-full" />
            ) : (
              <div className="flex h-full min-h-50 items-center justify-center p-8 text-center">
                <div>
                  {isUnavailable && <p className="text-sm font-medium text-gray-500">Página indisponível</p>}
                  {isFailed      && <p className="text-sm font-medium text-orange-500">Erro ao capturar screenshot</p>}
                  {isNoSite      && <p className="text-sm font-medium text-muted-foreground">Lead sem website</p>}
                  {!isUnavailable && !isFailed && !isNoSite && (
                    <p className="text-sm font-medium text-muted-foreground">Screenshot não disponível</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Coluna direita — análise */}
          <div className="sm:w-[55%] overflow-y-auto">
            {hasAnalysis ? (
              <div className="flex flex-col gap-5 p-5">

                {/* Scores */}
                {(e.design_score != null || e.tech_score != null) && (
                  <section>
                    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Pontuação
                    </h3>
                    <div className="flex flex-col gap-3">
                      {e.design_score != null && (
                        <ScoreBar label="Design / UX" value={e.design_score} color="bg-violet-500" />
                      )}
                      {e.tech_score != null && (
                        <ScoreBar label="Técnico" value={e.tech_score} color="bg-sky-500" />
                      )}
                      {e.design_label && (
                        <p className="text-xs italic text-muted-foreground border-l-2 border-muted pl-2">
                          {e.design_label}
                        </p>
                      )}
                    </div>
                  </section>
                )}

                {/* Pontos fracos */}
                {e.weak_points && e.weak_points.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Pontos fracos
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {e.weak_points.map((pt, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className="mt-0.5 shrink-0 font-bold text-red-400">✗</span>
                          <span className="text-foreground">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Melhorias rápidas */}
                {e.quick_wins && e.quick_wins.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Melhorias rápidas
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {e.quick_wins.map((pt, i) => (
                        <li key={i} className="flex gap-2 text-xs">
                          <span className="mt-0.5 shrink-0 font-bold text-green-500">✓</span>
                          <span className="text-foreground">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* Mensagem WhatsApp */}
                {e.outreach_message && (
                  <section>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Mensagem WhatsApp
                      </h3>
                      <CopyButton text={e.outreach_message} />
                    </div>
                    <p className="rounded-xl bg-muted/60 p-3.5 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                      {e.outreach_message}
                    </p>
                  </section>
                )}

                {/* Ganchos de venda */}
                {e.hooks && e.hooks.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Ganchos de venda
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {e.hooks.map((h, i) => (
                        <li key={i} className="rounded-xl border bg-card p-3 text-xs">
                          <p className="font-semibold text-foreground">{h.titulo}</p>
                          <p className="mt-1 text-muted-foreground leading-relaxed">{h.argumento}</p>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

              </div>
            ) : (
              /* Sem análise ainda */
              <div className="flex h-full min-h-50 items-center justify-center p-8 text-center">
                <div>
                  {e?.status === 'screenshot_done' ? (
                    <>
                      <p className="text-sm font-medium text-foreground">Análise pendente</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Screenshot capturado. Clique em "Analisar com IA" para processar.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sem dados de análise.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── tabela com site ──────────────────────────────────────────────────────────

function WithSiteTable({ leads }: { leads: LeadRow[] }) {
  const [modal, setModal] = useState<LeadModal | null>(null)

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-foreground">Nenhum lead com site</p>
        <p className="mt-1 text-xs text-muted-foreground">Todos os leads desta campanha estão sem website.</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Empresa</TableHead>
              <TableHead className="hidden sm:table-cell">Telefone</TableHead>
              <TableHead>Website</TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead className="hidden md:table-cell">Rating</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell text-right pr-6">Tech</TableHead>
              <TableHead className="hidden lg:table-cell text-right pr-6">Design</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow
                key={lead.id}
                className="cursor-pointer"
                onClick={() => setModal({ lead })}
              >
                <TableCell className="pl-6">
                  <span className="block max-w-40 truncate font-medium">{lead.company_name}</span>
                </TableCell>

                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {lead.phone ?? '—'}
                </TableCell>

                <TableCell onClick={(e) => e.stopPropagation()}>
                  <WebsiteLink href={lead.enrichment?.normalized_website ?? lead.website} />
                </TableCell>

                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {lead.category ?? '—'}
                </TableCell>

                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {lead.rating ?? '—'}
                </TableCell>

                <TableCell>
                  <EnrichBadge status={lead.enrichment?.status} websiteStatus={lead.enrichment?.website_status} />
                </TableCell>

                <TableCell className="hidden text-right text-muted-foreground lg:table-cell pr-6">
                  {lead.enrichment?.website_status === 'ok' && lead.enrichment.tech_score != null
                    ? lead.enrichment.tech_score
                    : <span className="text-xs">—</span>}
                </TableCell>

                <TableCell className="hidden text-right text-muted-foreground lg:table-cell pr-6">
                  {lead.enrichment?.website_status === 'ok' && lead.enrichment.design_score != null
                    ? lead.enrichment.design_score
                    : <span className="text-xs">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <LeadDetailDialog modal={modal} onClose={() => setModal(null)} />
    </>
  )
}

// ─── tabela sem site ──────────────────────────────────────────────────────────

function NoSiteTable({ leads }: { leads: LeadRow[] }) {
  const [modal, setModal] = useState<LeadModal | null>(null)

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-foreground">Nenhum lead sem site</p>
        <p className="mt-1 text-xs text-muted-foreground">Todos os leads desta campanha possuem website.</p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Empresa</TableHead>
              <TableHead className="hidden sm:table-cell">Telefone</TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead className="pr-6 hidden md:table-cell">Rating</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => (
              <TableRow
                key={lead.id}
                className="cursor-pointer"
                onClick={() => setModal({ lead })}
              >
                <TableCell className="pl-6">
                  <span className="block max-w-50 truncate font-medium">{lead.company_name}</span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {lead.phone ?? '—'}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {lead.category ?? '—'}
                </TableCell>
                <TableCell className="hidden pr-6 text-muted-foreground md:table-cell">
                  {lead.rating ?? '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <LeadDetailDialog modal={modal} onClose={() => setModal(null)} />
    </>
  )
}

// ─── component principal ──────────────────────────────────────────────────────

interface EnrichedLeadsTableProps {
  withSite: LeadRow[]
  noSite:   LeadRow[]
}

export function EnrichedLeadsTable({ withSite, noSite }: EnrichedLeadsTableProps) {
  return (
    <Tabs defaultValue="with-site">
      <div className="flex items-center gap-4">
        <TabsList>
          <TabsTrigger value="with-site" className="gap-2">
            Com site
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {withSite.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="no-site" className="gap-2">
            Sem site
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {noSite.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <span className="text-sm text-muted-foreground">
          {withSite.length + noSite.length} leads no total
        </span>
      </div>

      <TabsContent value="with-site">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-0">
            <WithSiteTable leads={withSite} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="no-site">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-0">
            <NoSiteTable leads={noSite} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
