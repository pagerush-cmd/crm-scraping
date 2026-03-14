import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

// POST /api/outreach/test-connection
export async function POST(req: NextRequest) {
  let body: { number?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ success: false, error: 'Body inválido' }, { status: 400 })
  }

  const { number } = body
  if (!number?.trim()) {
    return Response.json({ success: false, error: 'Número obrigatório' }, { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    const { data: settingsRows } = await supabase.from('settings').select('key, value')
    const s = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value as string]))

    const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
    const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
    const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''

    if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
      return Response.json({ success: false, error: 'Evolution API não configurada. Verifique as configurações.' })
    }

    const targetPhone = normalizePhone(number.trim())

    const res = await fetch(
      `${evolutionUrl}/message/sendText/${evolutionInstance}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body:    JSON.stringify({ number: targetPhone, text: '✅ CRM Scraping — conexão com WhatsApp funcionando!' }),
      }
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      return Response.json({ success: false, error: `Evolution API: ${res.status} — ${errText}` })
    }

    return Response.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ success: false, error: msg })
  }
}
