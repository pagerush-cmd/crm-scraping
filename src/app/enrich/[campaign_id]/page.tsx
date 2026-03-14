import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

import { createServerClient } from '@/lib/supabaseServer'
import { Button } from '@/components/ui/button'
import { EnrichedLeadsTable } from '@/components/enrich/enriched-leads-table'
import type { LeadRow } from '@/components/enrich/enriched-leads-table'

export default async function EnrichCampaignPage({
  params,
}: {
  params: Promise<{ campaign_id: string }>
}) {
  const { campaign_id } = await params
  const supabase = createServerClient()

  const [
    { data: campaign },
    { data: leads },
    { data: enrichments },
  ] = await Promise.all([
    supabase
      .from('campaigns')
      .select('id, name, city, niche')
      .eq('id', campaign_id)
      .single(),

    supabase
      .from('leads')
      .select('id, company_name, phone, address, website, category, rating, reviews_count')
      .eq('campaign_id', campaign_id)
      .order('company_name'),

    supabase
      .from('lead_enrichment')
      .select('lead_id, status, design_score, tech_score, normalized_website, screenshot_url, design_label, outreach_message, hooks, audit')
      .eq('campaign_id', campaign_id),
  ])

  if (!campaign) notFound()

  // Build enrichment map: lead_id → enrichment row
  const enrichmentMap = new Map(
    (enrichments ?? []).map((e) => [e.lead_id, e])
  )

  // Merge leads with enrichment data
  const allLeads: LeadRow[] = (leads ?? []).map((lead) => {
    const e = enrichmentMap.get(lead.id)
    if (!e) return { ...lead, enrichment: null }

    // audit contém campos sem coluna dedicada
    const audit = e.audit as {
      screenshot_url?: string
      website_status?: string
      weak_points?:    string[]
      quick_wins?:     string[]
    } | null

    // screenshot_url: prefer coluna dedicada, fallback para audit (registros antigos)
    const screenshotUrl = e.screenshot_url ?? audit?.screenshot_url ?? null

    return {
      ...lead,
      enrichment: {
        lead_id:          e.lead_id,
        status:           e.status,
        design_score:     e.design_score,
        tech_score:       e.tech_score,
        normalized_website: e.normalized_website,
        screenshot_url:   screenshotUrl,
        website_status:   audit?.website_status   ?? null,
        design_label:     e.design_label          ?? null,
        outreach_message: e.outreach_message      ?? null,
        hooks:            (e.hooks as Array<{ titulo: string; argumento: string }> | null) ?? null,
        weak_points:      audit?.weak_points      ?? null,
        quick_wins:       audit?.quick_wins       ?? null,
      },
    }
  })

  const withSite = allLeads.filter((l) => l.website && l.website.trim() !== '')
  const noSite   = allLeads.filter((l) => !l.website || l.website.trim() === '')

  return (
    <div className="flex flex-col gap-8 p-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-1 w-fit gap-2 text-muted-foreground"
          asChild
        >
          <Link href="/enrich">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>

        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {campaign.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {campaign.city} · {campaign.niche}
        </p>
      </div>

      <EnrichedLeadsTable withSite={withSite} noSite={noSite} />
    </div>
  )
}
