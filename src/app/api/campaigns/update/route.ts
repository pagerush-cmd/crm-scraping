import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 })
  }

  const { id, name, city, niche, daily_limit } = body

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ ok: false, error: 'id obrigatório' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ ok: false, error: 'name obrigatório' }, { status: 400 })
  }
  if (!city || typeof city !== 'string' || !city.trim()) {
    return NextResponse.json({ ok: false, error: 'city obrigatório' }, { status: 400 })
  }
  if (!niche || typeof niche !== 'string' || !niche.trim()) {
    return NextResponse.json({ ok: false, error: 'niche obrigatório' }, { status: 400 })
  }
  const limit = Number(daily_limit)
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    return NextResponse.json(
      { ok: false, error: 'daily_limit deve estar entre 1 e 200' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .update({
      name: name.trim(),
      city: city.trim(),
      niche: niche.trim(),
      daily_limit: limit,
    })
    .eq('id', id)
    .select('id, name, city, niche, status, daily_limit, created_at')
    .single()

  if (error) {
    console.error('[campaigns/update]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, campaign: data })
}
