import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'

export async function GET() {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, city, niche, status, daily_limit, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, campaigns: data })
}
