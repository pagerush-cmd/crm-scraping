import { createServerClient } from '@/lib/supabaseServer'
import type { Lead } from '@/types/lead'
import { ConversationsView } from '@/components/conversations/conversations-view'

export default async function ConversationsPage() {
  const supabase = createServerClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('id, campaign_id, company_name, phone, address, website, category, rating, reviews_count, status, outreach_status, source, created_at')
    .not('outreach_status', 'eq', 'new')
    .not('outreach_status', 'is', null)
    .order('created_at', { ascending: false })

  return <ConversationsView leads={(leads as Lead[]) ?? []} />
}
