import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

import type { Campaign } from '@/types/campaign'
import { OutreachPipeline, type PipelineLead } from '@/components/outreach/outreach-pipeline'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export default async function OutreachCampaignPage({
  params,
}: {
  params: Promise<{ campaign_id: string }>
}) {
  const { campaign_id } = await params
  const supabase = createServiceClient()

  const [{ data: campaign }, { data: leads }] = await Promise.all([
    supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single(),
    supabase
      .from('leads')
      .select('id, company_name, phone, website, status, created_at')
      .eq('campaign_id', campaign_id)
      .order('created_at', { ascending: false }),
  ])

  if (!campaign) notFound()

  return (
    <OutreachPipeline
      campaign={campaign as Campaign}
      leads={(leads ?? []) as PipelineLead[]}
    />
  )
}
