import { createServerClient } from '@/lib/supabaseServer'
import type { Campaign } from '@/types/campaign'
import { EnrichCampaigns } from '@/components/enrich/enrich-campaigns'

export const metadata = { title: 'Enriquecer Leads — Fase 2' }

export default async function EnrichPage() {
  const supabase = createServerClient()

  const [
    { data: campaigns },
    { data: leadRows },
    { data: pendingRows },
    { data: analysisRows },
  ] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, city, niche, status, daily_limit, created_at')
      .order('created_at', { ascending: false }),

    // total de leads por campanha
    supabase.from('leads').select('campaign_id'),

    // leads pendentes de enriquecimento (sem screenshot ainda)
    supabase.from('leads_to_enrich').select('campaign_id'),

    // leads com screenshot prontos aguardando análise de IA
    supabase.from('lead_enrichment').select('campaign_id').eq('status', 'screenshot_done'),
  ])

  // Agrupar contagens por campaign_id em JS
  const totalMap = new Map<string, number>()
  for (const { campaign_id } of (leadRows ?? [])) {
    totalMap.set(campaign_id, (totalMap.get(campaign_id) ?? 0) + 1)
  }

  const pendingMap = new Map<string, number>()
  for (const { campaign_id } of (pendingRows ?? [])) {
    pendingMap.set(campaign_id, (pendingMap.get(campaign_id) ?? 0) + 1)
  }

  const analysisMap = new Map<string, number>()
  for (const { campaign_id } of (analysisRows ?? [])) {
    analysisMap.set(campaign_id, (analysisMap.get(campaign_id) ?? 0) + 1)
  }

  const stats = ((campaigns as Campaign[]) ?? []).map((c) => ({
    campaign:      c,
    totalLeads:    totalMap.get(c.id)    ?? 0,
    pendingLeads:  pendingMap.get(c.id)  ?? 0,
    analysisLeads: analysisMap.get(c.id) ?? 0,
  }))

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Enriquecer Leads
        </h1>
        <p className="text-sm text-muted-foreground">
          Inicie o enriquecimento de leads por campanha para obter dados adicionais.
        </p>
      </div>

      <EnrichCampaigns stats={stats} />
    </div>
  )
}
