import { createClient } from '@supabase/supabase-js'
import { Megaphone, Users, TrendingUp, DollarSign, MessageSquare } from 'lucide-react'

import { STATUS_CONFIG, type LeadStatus } from '@/lib/outreach-config'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR')
}

function fmtBrl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

// Funil: order to show
const FUNNEL: LeadStatus[] = [
  'contacted', 'responding', 'interested', 'negotiating',
  'waiting_human', 'proposal_sent', 'closed_won', 'closed_lost', 'no_contact',
]

export default async function DashboardPage() {
  const supabase = createServiceClient()

  const [
    { data: campaigns },
    { data: leads },
    { data: priceSetting },
    { data: recentLeads },
  ] = await Promise.all([
    supabase.from('campaigns').select('id, name, status'),
    supabase.from('leads').select('id, campaign_id, company_name, status, created_at'),
    supabase.from('settings').select('value').eq('key', 'service_price').single(),
    supabase
      .from('leads')
      .select('id, company_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  const servicePrice = parseFloat(priceSetting?.value ?? '0') || 0
  const allLeads = leads ?? []

  // counts per status
  const countByStatus = new Map<string, number>()
  for (const l of allLeads) {
    countByStatus.set(l.status, (countByStatus.get(l.status) ?? 0) + 1)
  }

  const totalLeads       = allLeads.length
  const totalNew         = countByStatus.get('new') ?? 0
  const totalContacted   = totalLeads - totalNew
  const totalClosed      = countByStatus.get('closed_won') ?? 0
  const totalWaiting     = countByStatus.get('waiting_human') ?? 0
  const convRate         = totalContacted > 0 ? ((totalClosed / totalContacted) * 100).toFixed(1) : null
  const revenue          = totalClosed * servicePrice

  const activeCampaigns  = (campaigns ?? []).filter((c) => c.status === 'running').length

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral do pipeline de vendas.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Campanhas Ativas</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeCampaigns > 0 ? fmt(activeCampaigns) : '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{(campaigns ?? []).length} campanhas no total</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leads Contatados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalContacted > 0 ? fmt(totalContacted) : '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{fmt(totalLeads)} leads no total</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Taxa de Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{convRate ? `${convRate}%` : '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{fmt(totalClosed)} fechados</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receita Estimada</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{revenue > 0 ? fmtBrl(revenue) : '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{servicePrice > 0 ? `${fmtBrl(servicePrice)} por fechamento` : 'Configure o preço nas configurações'}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Funil */}
        <Card className="rounded-2xl shadow-sm xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Pipeline por Estágio</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {FUNNEL.map((key) => {
              const cfg   = STATUS_CONFIG[key]
              const count = countByStatus.get(key) ?? 0
              const max   = Math.max(...FUNNEL.map((k) => countByStatus.get(k) ?? 0), 1)
              const pct   = Math.round((count / max) * 100)
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-xs text-muted-foreground">{cfg.label}</span>
                  <div className="flex-1 rounded-full bg-muted h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${cfg.bg} transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs font-medium text-foreground">{fmt(count)}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Atenção Necessária
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totalWaiting === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum lead aguardando atendimento humano.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 dark:bg-red-950">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                      {fmt(totalWaiting)} lead{totalWaiting > 1 ? 's' : ''} aguardando humano
                    </p>
                    <p className="text-xs text-red-600/70 dark:text-red-400/70">
                      Acesse Disparos para atender
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Atividade recente */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Atividade Recente</CardTitle>
        </CardHeader>
        <CardContent>
          {(recentLeads ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lead ainda.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {(recentLeads ?? []).map((lead) => {
                const cfg = STATUS_CONFIG[lead.status as LeadStatus]
                const d   = new Date(lead.created_at)
                return (
                  <div key={lead.id} className="flex items-center justify-between py-2.5 gap-3">
                    <span className="text-sm font-medium text-foreground truncate">{lead.company_name}</span>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {cfg ? (
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 border-transparent ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{lead.status}</Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
