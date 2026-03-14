import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_STATUSES = ['draft', 'running', 'completed', 'paused'] as const

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Chamado pelo n8n (ou outro serviço externo) para atualizar o status da campanha.
// POST /api/campaigns/status  { campaign_id: string, status: string }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 })
  }

  const { campaign_id, status } = body

  if (!campaign_id || typeof campaign_id !== 'string') {
    return NextResponse.json({ ok: false, error: 'campaign_id obrigatório' }, { status: 400 })
  }

  if (!status || !ALLOWED_STATUSES.includes(status as typeof ALLOWED_STATUSES[number])) {
    return NextResponse.json(
      { ok: false, error: `status deve ser um de: ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('campaigns')
    .update({ status })
    .eq('id', campaign_id)
    .select('id, name, status')
    .single()

  if (error) {
    console.error('[campaigns/status]', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, campaign: data })
}
