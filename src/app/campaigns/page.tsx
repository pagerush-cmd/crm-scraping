import { createServerClient } from '@/lib/supabaseServer'
import type { Campaign } from '@/types/campaign'
import { CampaignsTable } from '@/components/campaigns/campaigns-table'

export const dynamic = 'force-dynamic'

export default async function CampaignsPage() {
  const supabase = createServerClient()

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, city, niche, status, daily_limit, created_at')
    .order('created_at', { ascending: false })

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Campanhas
        </h1>
        <p className="text-sm text-muted-foreground">
          Gerencie suas campanhas e colete leads via Google Maps.
        </p>
      </div>

      <CampaignsTable initialCampaigns={(campaigns as Campaign[]) ?? []} />
    </div>
  )
}
