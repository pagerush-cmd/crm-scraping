import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  // ── 1. Parse body ─────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 })
  }

  const { name, city, niche, daily_limit } = body

  // ── 2. Validações ─────────────────────────────────────────────────────────
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'name obrigatório' }, { status: 400 })
  }
  if (!city || typeof city !== 'string' || city.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'city obrigatório' }, { status: 400 })
  }
  if (!niche || typeof niche !== 'string' || niche.trim().length === 0) {
    return NextResponse.json({ ok: false, error: 'niche obrigatório' }, { status: 400 })
  }
  const limit = Number(daily_limit)
  if (!Number.isFinite(limit) || limit < 1 || limit > 200) {
    return NextResponse.json(
      { ok: false, error: 'daily_limit deve estar entre 1 e 200' },
      { status: 400 }
    )
  }

  // ── 3. Inserir no Supabase ─────────────────────────────────────────────────
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      name: name.trim(),
      city: city.trim(),
      niche: niche.trim(),
      daily_limit: limit,
      status: 'draft',
    })
    .select('id, name, city, niche, status, daily_limit, created_at')
    .single()

  if (error) {
    console.error('[campaigns/create]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, campaign: data })
}
