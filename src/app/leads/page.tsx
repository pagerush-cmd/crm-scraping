import { createServerClient } from '@/lib/supabaseServer'
import type { Lead } from '@/types/lead'
import type { Campaign } from '@/types/campaign'
import { LeadsTable } from '@/components/leads/leads-table'

export default async function LeadsPage() {
  const supabase = createServerClient()

  const [{ data: leads }, { data: campaigns }] = await Promise.all([
    supabase
      .from('leads')
      .select(
        'id, campaign_id, company_name, phone, address, website, category, rating, reviews_count, status, source, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(500),

    supabase
      .from('campaigns')
      .select('id, name, city, niche, status, daily_limit, created_at'),
  ])

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Leads
        </h1>
        <p className="text-sm text-muted-foreground">
          Visualize e gerencie todos os leads coletados.
        </p>
      </div>

      <LeadsTable
        leads={(leads as Lead[]) ?? []}
        campaigns={(campaigns as Campaign[]) ?? []}
      />
    </div>
  )
}
