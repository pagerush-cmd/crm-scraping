import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Megaphone, Users, TrendingUp, Clock } from 'lucide-react'

import { createServerClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── tipos locais ──────────────────────────────────────────────────────────────

interface Campaign {
  id: string
  name: string
  city: string
  niche: string
  status: string
}

interface Lead {
  id: string
  campaign_id: string
  company_name: string
  status: string
  created_at: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return format(new Date(iso), 'dd/MM HH:mm', { locale: ptBR })
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    new: 'Novo',
    contacted: 'Contatado',
    qualified: 'Qualificado',
    converted: 'Convertido',
    lost: 'Perdido',
  }
  return map[status] ?? status
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = createServerClient()

  // Todas as queries em paralelo
  const [
    { data: activeCampaigns },
    { count: totalLeads },
    { data: lastLeadRow },
    { data: recentLeads },
    { data: allCampaigns },
  ] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, city, niche, status')
      .eq('status', 'running'),

    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true }),

    supabase
      .from('leads')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1),

    supabase
      .from('leads')
      .select('id, campaign_id, company_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10),

    supabase
      .from('campaigns')
      .select('id, city, niche'),
  ])

  // Mapa id → campanha para o join manual na tabela de leads
  const campaignMap = new Map<string, { city: string; niche: string }>(
    (allCampaigns ?? []).map((c) => [c.id, { city: c.city, niche: c.niche }])
  )

  const lastCollectIso: string | null = lastLeadRow?.[0]?.created_at ?? null
  const activeCampaignsCount = activeCampaigns?.length ?? 0
  const hasLeads = (recentLeads?.length ?? 0) > 0

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            CRM Scraping — Fase 1
          </h1>
          <Badge variant="secondary" className="rounded-xl text-xs">
            Coletor + CRM
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Visão geral das campanhas e leads coletados.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Campanhas Ativas */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Campanhas Ativas
            </CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {activeCampaignsCount > 0 ? activeCampaignsCount : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeCampaignsCount > 0
                ? `${activeCampaignsCount} em execução`
                : 'Nenhuma campanha ainda'}
            </p>
          </CardContent>
        </Card>

        {/* Total de Leads */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Leads
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {totalLeads != null && totalLeads > 0
                ? totalLeads.toLocaleString('pt-BR')
                : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalLeads ? 'leads coletados' : 'Nenhum lead ainda'}
            </p>
          </CardContent>
        </Card>

        {/* Taxa de Conversão */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Taxa de Conversão
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">—</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sem dados suficientes
            </p>
          </CardContent>
        </Card>

        {/* Última Coleta */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Última Coleta
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">
              {lastCollectIso
                ? format(new Date(lastCollectIso), 'HH:mm')
                : '—'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {lastCollectIso
                ? format(new Date(lastCollectIso), "dd/MM/yyyy", { locale: ptBR })
                : 'Nenhuma coleta realizada'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Atividade Recente */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasLeads ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Nicho</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(recentLeads as Lead[]).map((lead) => {
                  const campaign = campaignMap.get(lead.campaign_id)
                  return (
                    <TableRow key={lead.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(lead.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {lead.company_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {campaign?.city ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {campaign?.niche ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="rounded-lg text-xs">
                          {statusLabel(lead.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <TrendingUp className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">
                Nenhuma atividade ainda
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crie uma campanha e comece a coletar leads para ver a atividade aqui.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
