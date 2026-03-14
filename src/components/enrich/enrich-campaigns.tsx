'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Camera, ExternalLink, Sparkles } from 'lucide-react'

import type { Campaign } from '@/types/campaign'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EnrichStepperModal, type StepperMode } from '@/components/enrich/enrich-stepper-modal'

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface EnrichStats {
  campaign:      Campaign
  totalLeads:    number
  pendingLeads:  number
  analysisLeads: number   // leads com screenshot prontos para análise de IA
}

// ─── config de status ─────────────────────────────────────────────────────────

type EnrichStatus = 'sem-leads' | 'pendente' | 'em-andamento' | 'concluido'

const STATUS_CFG: Record<EnrichStatus, { label: string; className: string }> = {
  'sem-leads':    { label: 'Sem leads',    className: 'bg-gray-100  text-gray-600  border-transparent' },
  'pendente':     { label: 'Pendente',     className: 'bg-amber-100 text-amber-700 border-transparent' },
  'em-andamento': { label: 'Em andamento', className: 'bg-blue-100  text-blue-700  border-transparent' },
  'concluido':    { label: 'Concluído',    className: 'bg-green-100 text-green-700 border-transparent' },
}

function getStatus(total: number, pending: number): EnrichStatus {
  if (total === 0)       return 'sem-leads'
  if (pending === 0)     return 'concluido'
  if (pending === total) return 'pendente'
  return 'em-andamento'
}

// ─── component ────────────────────────────────────────────────────────────────

interface EnrichCampaignsProps {
  stats: EnrichStats[]
}

export function EnrichCampaigns({ stats }: EnrichCampaignsProps) {
  const [filter, setFilter]           = useState<'all' | 'pending'>('all')
  const [stepperCampaign, setStepperCampaign] = useState<Campaign | null>(null)
  const [stepperMode, setStepperMode] = useState<StepperMode>('full')

  const pendingCount = useMemo(
    () => stats.filter((s) => s.pendingLeads > 0).length,
    [stats]
  )

  const filtered = useMemo(
    () => filter === 'pending' ? stats.filter((s) => s.pendingLeads > 0) : stats,
    [stats, filter]
  )

  function openStepper(campaign: Campaign, mode: StepperMode) {
    setStepperMode(mode)
    setStepperCampaign(campaign)
  }

  return (
    <div className="flex flex-col gap-6">

      {/* ── Filtro ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'pending')}>
          <TabsList>
            <TabsTrigger value="all">Todas</TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              Com pendências
              {pendingCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <span className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'campanha' : 'campanhas'}
        </span>
      </div>

      {/* ── Estado vazio ────────────────────────────────────────────────────── */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border bg-card py-16 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma campanha encontrada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filter === 'pending'
              ? 'Não há campanhas com leads pendentes de enriquecimento.'
              : 'Nenhuma campanha cadastrada.'}
          </p>
        </div>
      )}

      {/* ── Cards grid ──────────────────────────────────────────────────────── */}
      {filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ campaign, totalLeads, pendingLeads, analysisLeads }) => {
            const enriched  = totalLeads - pendingLeads
            const status    = getStatus(totalLeads, pendingLeads)
            const statusCfg = STATUS_CFG[status]

            return (
              <Card key={campaign.id} className="rounded-2xl shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-sm font-semibold">
                        {campaign.name}
                      </CardTitle>
                      <CardDescription className="mt-0.5 truncate text-xs">
                        {campaign.city} · {campaign.niche}
                      </CardDescription>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`shrink-0 rounded-lg text-xs ${statusCfg.className}`}
                    >
                      {statusCfg.label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  {/* Métricas */}
                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-center">
                    <div>
                      <p className="text-base font-bold text-foreground">
                        {totalLeads.toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-amber-600">
                        {pendingLeads.toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-muted-foreground">Pendentes</p>
                    </div>
                    <div>
                      <p className="text-base font-bold text-green-600">
                        {enriched.toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-muted-foreground">Enriquecidos</p>
                    </div>
                  </div>

                  {/* ── Ações ──────────────────────────────────────────────── */}

                  {/* Botão de análise de IA — aparece sempre que há prints prontos */}
                  {analysisLeads > 0 && (
                    <Button
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={() => openStepper(campaign, 'analyze')}
                    >
                      <Sparkles className="h-4 w-4" />
                      Analisar com IA
                      <span className="ml-auto rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
                        {analysisLeads}
                      </span>
                    </Button>
                  )}

                  {status === 'sem-leads' && (
                    <Button size="sm" variant="outline" className="w-full gap-1.5" asChild>
                      <Link href={`/enrich/${campaign.id}`}>
                        <ExternalLink className="h-4 w-4" />
                        Ver leads
                      </Link>
                    </Button>
                  )}

                  {status === 'pendente' && (
                    <Button
                      size="sm"
                      variant={analysisLeads > 0 ? 'outline' : 'default'}
                      className="w-full gap-1.5"
                      onClick={() => openStepper(campaign, 'full')}
                    >
                      <Camera className="h-4 w-4" />
                      Capturar screenshots
                    </Button>
                  )}

                  {status === 'em-andamento' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={analysisLeads > 0 ? 'outline' : 'default'}
                        className="flex-1 gap-1.5"
                        onClick={() => openStepper(campaign, 'full')}
                      >
                        <Camera className="h-4 w-4" />
                        Continuar prints
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" asChild>
                        <Link href={`/enrich/${campaign.id}`}>
                          <ExternalLink className="h-4 w-4" />
                          Ver leads
                        </Link>
                      </Button>
                    </div>
                  )}

                  {status === 'concluido' && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" asChild>
                        <Link href={`/enrich/${campaign.id}`}>
                          <ExternalLink className="h-4 w-4" />
                          Ver leads
                        </Link>
                      </Button>
                      {analysisLeads === 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 gap-1.5"
                          onClick={() => openStepper(campaign, 'full')}
                        >
                          <Camera className="h-4 w-4" />
                          Re-capturar
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Stepper modal ───────────────────────────────────────────────────── */}
      <EnrichStepperModal
        campaign={stepperCampaign}
        mode={stepperMode}
        open={stepperCampaign !== null}
        onOpenChange={(o) => { if (!o) setStepperCampaign(null) }}
      />
    </div>
  )
}
