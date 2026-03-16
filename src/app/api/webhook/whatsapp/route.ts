import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function toPhone11(jid: string): string | null {
  if (!jid.includes('@s.whatsapp.net')) return null
  const raw = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
  return raw.length === 13 && raw.startsWith('55') ? raw.substring(2) : raw.slice(-11)
}

async function processIncoming(body: Record<string, unknown>) {
  try {
    const event = body.event as string
    if (event !== 'messages.upsert') return

    const data      = body.data as Record<string, unknown>
    const key       = data?.key as Record<string, unknown>
    const fromMe    = key?.fromMe as boolean
    const remoteJid = String(key?.remoteJid ?? '')
    const senderPn  = String(key?.senderPn  ?? '')

    console.log('[webhook] fromMe:', fromMe, '| remoteJid:', remoteJid, '| senderPn:', senderPn, '| source:', (data as Record<string, unknown>)?.source)

    if (fromMe) return

    // ── Extrair texto ────────────────────────────────────────────────────────
    const msgData = data?.message as Record<string, unknown> | null
    const text = (
      (msgData?.conversation as string) ??
      ((msgData?.extendedTextMessage as Record<string, unknown>)?.text as string) ??
      ''
    ).trim()

    if (!text) {
      console.log('[webhook] texto vazio, ignorando')
      return
    }

    const supabase = createServiceClient()

    // ── Resolver phoneNumber ────────────────────────────────────────────────
    let phoneNumber: string | null = null

    if (senderPn.includes('@s.whatsapp.net')) {
      phoneNumber = toPhone11(senderPn)
      console.log('[webhook] phone via senderPn:', phoneNumber)

    } else if (remoteJid.includes('@s.whatsapp.net')) {
      phoneNumber = toPhone11(remoteJid)
      console.log('[webhook] phone via remoteJid:', phoneNumber)

    } else if (remoteJid.includes('@lid')) {
      // Buscar em test_numbers pelo lid_jid (uma única query)
      const { data: allTestNums } = await supabase
        .from('test_numbers')
        .select('phone, lid_jid')

      const byExactLid = (allTestNums ?? []).find((n: { phone: string; lid_jid: string | null }) =>
        n.lid_jid === remoteJid
      )

      if (byExactLid) {
        phoneNumber = String(byExactLid.phone).replace(/\D/g, '').slice(-11)
        console.log('[webhook] phone via lid_jid exato:', phoneNumber)
      } else {
        // Fallback: lid_jid está em @s.whatsapp.net → atualizar para @lid
        const fallback = (allTestNums ?? []).find((n: { phone: string; lid_jid: string | null }) =>
          n.lid_jid?.includes('@s.whatsapp.net')
        )
        if (fallback) {
          phoneNumber = String(fallback.phone).replace(/\D/g, '').slice(-11)
          console.log('[webhook] phone via fallback @s.whatsapp.net:', phoneNumber, '— atualizando lid_jid para:', remoteJid)
          supabase.from('test_numbers').update({ lid_jid: remoteJid }).eq('phone', fallback.phone).then(() => {})
        } else {
          console.log('[webhook] @lid sem match em test_numbers:', remoteJid)
          return
        }
      }
    } else {
      console.log('[webhook] formato desconhecido — remoteJid:', remoteJid)
      return
    }

    if (!phoneNumber) {
      console.log('[webhook] phoneNumber vazio')
      return
    }

    // ── Buscar leads e test_numbers em paralelo ────────────────────────────
    const [leadsRes, testNumsRes] = await Promise.all([
      supabase.from('leads').select('id, company_name, phone, outreach_status').not('phone', 'is', null),
      supabase.from('test_numbers').select('id, phone').not('phone', 'is', null),
    ])

    const lead = (leadsRes.data ?? []).find((l) =>
      String(l.phone ?? '').replace(/\D/g, '').slice(-11) === phoneNumber
    )
    const matchedTest = (testNumsRes.data ?? []).find((n: { phone: string }) =>
      String(n.phone ?? '').replace(/\D/g, '').slice(-11) === phoneNumber
    )

    console.log('[webhook] lead:', lead?.id ?? 'não encontrado', '| test_number:', matchedTest ? 'SIM' : 'NÃO')

    if (matchedTest) {
      const { error: insertErr } = await supabase.from('test_messages').insert({
        phone:     phoneNumber,
        direction: 'inbound',
        content:   text,
      })
      console.log('[webhook] test_messages insert error:', insertErr)
    }

  } catch (err) {
    console.error('[webhook] erro:', err instanceof Error ? err.message : err)
  }
}

// POST /api/webhook/whatsapp
export async function POST(req: NextRequest) {
  console.log('[webhook] INICIO')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  processIncoming(body)

  return new Response('OK', { status: 200 })
}
