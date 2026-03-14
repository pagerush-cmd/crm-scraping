export type CampaignStatus = 'running' | 'paused' | 'completed' | 'draft'

export interface Campaign {
  id: string
  name: string
  city: string
  niche: string
  status: CampaignStatus
  daily_limit: number
  created_at: string
}
