export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'qualified'
  | 'converted'
  | 'invalid'
  | 'lost'

export interface Lead {
  id: string
  campaign_id: string
  company_name: string
  phone: string | null
  address: string | null
  website: string | null
  category: string | null
  rating: number | null
  reviews_count: number | null
  status: LeadStatus
  source: string | null
  created_at: string
}
