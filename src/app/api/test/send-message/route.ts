import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// POST /api/test/send-message
export async function POST(req: NextRequest) {
  const { to, message }: { to?: string; message?: string } = await req.json()

  if (!to || !message) {
    return NextResponse.json({ error: 'to e message são obrigatórios' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: settingsRows } = await supabase.from('settings').select('key, value')
  const s = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value as string]))

  const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
  const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
  const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''

  if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
    return NextResponse.json({ error: 'Evolution API não configurada' }, { status: 500 })
  }

  const digits      = to.replace(/\D/g, '')
  const targetPhone = digits.startsWith('55') ? digits : `55${digits}`

  const res = await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
    body:    JSON.stringify({ number: targetPhone, text: message }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText)
    return NextResponse.json({ error: `Evolution API: ${res.status} — ${errText}` }, { status: 502 })
  }

  const phone11 = digits.length === 13 && digits.startsWith('55') ? digits.substring(2) : digits.slice(-11)

  // Salvar lid_jid retornado pela Evolution em test_numbers
  try {
    const evoData = await res.clone().json()
    console.log('[send-message] Evolution response:', JSON.stringify(evoData))
    const lidJid = evoData?.key?.remoteJid as string | undefined
    console.log('[send-message] lidJid extraído:', lidJid, '| phone11:', phone11)
    if (lidJid) {
      const { error: updateErr } = await supabase
        .from('test_numbers')
        .update({ lid_jid: lidJid })
        .eq('phone', phone11)
      console.log('[send-message] update lid_jid error:', updateErr)
    }
  } catch (e) {
    console.log('[send-message] erro ao salvar lid_jid:', e)
  }

  // Salvar mensagem outbound em test_messages
  await supabase.from('test_messages').insert({
    phone:     phone11,
    direction: 'outbound',
    content:   message,
  })

  return NextResponse.json({ ok: true })
}
