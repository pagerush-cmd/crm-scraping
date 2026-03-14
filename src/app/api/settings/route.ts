import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// POST /api/settings
// body: { settings: { key: string; value: string }[] }
export async function POST(req: NextRequest) {
  let settings: { key: string; value: string }[]
  try {
    const body = await req.json()
    if (!Array.isArray(body?.settings)) {
      return NextResponse.json({ ok: false, error: 'settings deve ser um array' }, { status: 400 })
    }
    settings = body.settings
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('settings')
    .upsert(settings, { onConflict: 'key' })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
