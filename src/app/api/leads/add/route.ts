import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// POST /api/leads/add
// body: { campaign_id, company_name, phone, category?, address?, website?, rating?, reviews_count? }
export async function POST(req: NextRequest) {
  const body: {
    campaign_id:    string
    company_name:   string
    phone:          string
    category?:      string
    address?:       string
    website?:       string
    rating?:        number | null
    reviews_count?: number | null
  } = await req.json()

  if (!body.campaign_id || !body.company_name?.trim() || !body.phone?.trim()) {
    return NextResponse.json({ error: 'campaign_id, company_name e phone são obrigatórios' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('leads')
    .insert({
      campaign_id:    body.campaign_id,
      company_name:   body.company_name.trim(),
      phone:          body.phone.trim(),
      category:       body.category?.trim()  || null,
      address:        body.address?.trim()   || null,
      website:        body.website?.trim()   || null,
      rating:         body.rating            ?? null,
      reviews_count:  body.reviews_count     ?? null,
      status:         'new',
      outreach_status:'new',
      source:         'manual',
    })
    .select('id, campaign_id, company_name, phone, address, website, category, rating, reviews_count, status, outreach_status, source, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, lead: data })
}
