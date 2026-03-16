import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// POST /api/leads/[id]/send
// body: { content: string }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { content }: { content?: string } = await req.json()

  if (!content?.trim()) {
    return NextResponse.json({ error: 'content obrigatório' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const [leadRes, settingsRes] = await Promise.all([
    supabase.from('leads').select('id, phone').eq('id', id).single(),
    supabase.from('settings').select('key, value'),
  ])

  if (leadRes.error || !leadRes.data) {
    return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
  }

  const s = Object.fromEntries((settingsRes.data ?? []).map((r) => [r.key, r.value as string]))
  const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
  const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
  const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''

  if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
    return NextResponse.json({ error: 'Evolution não configurada' }, { status: 500 })
  }

  const digits      = String(leadRes.data.phone ?? '').replace(/\D/g, '')
  const targetPhone = digits.startsWith('55') ? digits : `55${digits}`

  const evoRes = await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
    body:    JSON.stringify({ number: targetPhone, text: content.trim() }),
  })

  if (!evoRes.ok) {
    const err = await evoRes.text().catch(() => evoRes.statusText)
    return NextResponse.json({ error: `Evolution: ${evoRes.status} — ${err}` }, { status: 502 })
  }

  await supabase.from('messages').insert({
    lead_id:   id,
    direction: 'outbound',
    channel:   'whatsapp',
    content:   content.trim(),
    status:    'sent',
  })

  return NextResponse.json({ ok: true })
}
