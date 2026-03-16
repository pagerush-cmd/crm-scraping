import { createClient } from '@supabase/supabase-js'
import type { Lead } from '@/types/lead'
import { ConversationsView } from '@/components/conversations/conversations-view'

export const dynamic = 'force-dynamic'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export default async function ConversationsPage() {
  const supabase = createServiceClient()

  const { data: leads } = await supabase
    .from('leads')
    .select('id, campaign_id, company_name, phone, address, website, category, rating, reviews_count, status, outreach_status, source, created_at')
    .not('outreach_status', 'eq', 'new')
    .not('outreach_status', 'is', null)
    .order('created_at', { ascending: false })

  return <ConversationsView leads={(leads as Lead[]) ?? []} />
}
