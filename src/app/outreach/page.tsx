import { createClient } from '@supabase/supabase-js'
import { Send } from 'lucide-react'

import type { Campaign } from '@/types/campaign'
import { OutreachCampaigns, type CampaignOutreachStats, type OutreachSettings } from '@/components/outreach/outreach-campaigns'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export default async function OutreachPage() {
  const supabase = createServiceClient()

  const [{ data: campaigns }, { data: leads }, { data: priceSetting }, { data: settingsRows }] = await Promise.all([
    supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
    supabase.from('leads').select('id, campaign_id, status, outreach_status, phone, company_name'),
    supabase.from('settings').select('value').eq('key', 'service_price').single(),
    supabase.from('settings').select('key, value').in('key', [
      'outreach_daily_limit', 'outreach_active_hours', 'outreach_delay_min', 'outreach_delay_max',
    ]),
  ])

  const servicePrice = parseFloat(priceSetting?.value ?? '0') || 0

  const settingsMap = Object.fromEntries((settingsRows ?? []).map((s) => [s.key, s.value as string]))
  const outreachSettings: OutreachSettings = {
    daily_limit:  settingsMap['outreach_daily_limit']  ?? '',
    active_hours: settingsMap['outreach_active_hours'] ?? '',
    delay_min:    settingsMap['outreach_delay_min']    ?? '',
    delay_max:    settingsMap['outreach_delay_max']    ?? '',
  }

  // Aggregate lead stats per campaign
  const statsMap = new Map<string, { total: number; contacted: number; responded: number; closed: number; outreachNew: number; firstNewLeadName: string }>()

  for (const lead of leads ?? []) {
    const s        = lead.status as string
    const sOut     = (lead.outreach_status ?? 'new') as string
    const hasPhone = Boolean(lead.phone)
    const prev     = statsMap.get(lead.campaign_id) ?? { total: 0, contacted: 0, responded: 0, closed: 0, outreachNew: 0, firstNewLeadName: '' }

    prev.total++
    if (s !== 'new') prev.contacted++
    if (['responding','interested','negotiating','waiting_human','proposal_sent','closed_won','closed_lost'].includes(s)) prev.responded++
    if (s === 'closed_won') prev.closed++
    if (sOut === 'new' && hasPhone) {
      prev.outreachNew++
      if (!prev.firstNewLeadName) prev.firstNewLeadName = String((lead as { company_name?: string }).company_name ?? '')
    }

    statsMap.set(lead.campaign_id, prev)
  }

  const stats: CampaignOutreachStats[] = (campaigns ?? []).map((c: Campaign) => {
    const s = statsMap.get(c.id) ?? { total: 0, contacted: 0, responded: 0, closed: 0, outreachNew: 0, firstNewLeadName: '' }
    return {
      campaign:          c,
      total:             s.total,
      contacted:         s.contacted,
      responded:         s.responded,
      closed:            s.closed,
      revenue:           s.closed * servicePrice,
      outreachNew:       s.outreachNew,
      firstNewLeadName:  s.firstNewLeadName,
    }
  })

  return (
    <div className="flex flex-col gap-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
          <Send className="h-5 w-5 text-muted-foreground" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Disparos</h1>
          <p className="text-sm text-muted-foreground">Pipeline de outreach por campanha</p>
        </div>
      </div>

      <OutreachCampaigns stats={stats} outreachSettings={outreachSettings} />
    </div>
  )
}
