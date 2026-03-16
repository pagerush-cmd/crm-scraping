import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function processIncoming(body: Record<string, unknown>) {
  try {
    console.log('[webhook] body recebido:', JSON.stringify(body, null, 2))

    const event = body.event as string
    if (event !== 'messages.upsert') {
      console.log('[webhook] ignorando evento:', event)
      return
    }

    const data      = body.data as Record<string, unknown>
    const key       = data?.key as Record<string, unknown>
    const fromMe    = key?.fromMe as boolean
    const remoteJid = String(key?.remoteJid ?? '')
    const senderPn  = String(key?.senderPn  ?? '')

    // Log completo dos campos de identificação — essencial para debug Android vs Web
    console.log('[webhook] --- IDENTIFICAÇÃO ---')
    console.log('[webhook] fromMe:', fromMe)
    console.log('[webhook] remoteJid:', remoteJid)
    console.log('[webhook] senderPn:', senderPn)
    console.log('[webhook] key completo:', JSON.stringify(key, null, 2))
    console.log('[webhook] data.participant:', data?.participant)
    console.log('[webhook] data.pushName:', data?.pushName)
    console.log('[webhook] data.device:', (data as Record<string, unknown>)?.device)
    console.log('[webhook] messageType:', data?.messageType)
    console.log('[webhook] message keys:', Object.keys((data?.message as Record<string, unknown>) ?? {}))

    if (fromMe) {
      console.log('[webhook] ignorando mensagem própria')
      return
    }

    // ── Extrair número ────────────────────────────────────────────────────────
    // Prioridade: senderPn > remoteJid @s.whatsapp.net
    function toPhone11(jid: string): string | null {
      if (!jid.includes('@s.whatsapp.net')) return null
      const raw = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
      return raw.length === 13 && raw.startsWith('55') ? raw.substring(2) : raw.slice(-11)
    }

    let phoneNumber: string | null = null

    const supabase = createServiceClient()

    if (senderPn.includes('@s.whatsapp.net')) {
      phoneNumber = toPhone11(senderPn)
      console.log('[webhook] phoneNumber via senderPn:', phoneNumber)
    } else if (remoteJid.includes('@s.whatsapp.net')) {
      phoneNumber = toPhone11(remoteJid)
      console.log('[webhook] phoneNumber via remoteJid:', phoneNumber)
    } else if (remoteJid.includes('@lid')) {
      // Buscar test_number pelo lid_jid salvo
      console.log('[webhook] remoteJid é @lid, buscando em test_numbers:', remoteJid)
      const { data: testByLid } = await supabase
        .from('test_numbers')
        .select('phone')
        .eq('lid_jid', remoteJid)
        .maybeSingle()
      if (testByLid?.phone) {
        const raw = String(testByLid.phone).replace(/\D/g, '')
        phoneNumber = raw.slice(-11)
        console.log('[webhook] phoneNumber via test_numbers.lid_jid:', phoneNumber)
      } else {
        console.log('[webhook] @lid não encontrado em test_numbers — remoteJid:', remoteJid)
        return
      }
    } else {
      console.log('[webhook] não foi possível extrair número — remoteJid:', remoteJid, 'senderPn:', senderPn)
      return
    }

    if (!phoneNumber) {
      console.log('[webhook] phoneNumber vazio após extração')
      return
    }

    const { data: leadsFound, error } = await supabase
      .from('leads')
      .select('id, company_name, phone, outreach_status')
      .not('phone', 'is', null)

    console.log('[webhook] supabase error:', error)
    console.log('[webhook] total leads no banco:', leadsFound?.length ?? 0)

    const lead = (leadsFound ?? []).find((l) => {
      return String(l.phone ?? '').replace(/\D/g, '').slice(-11) === phoneNumber
    })

    if (lead) {
      console.log('[webhook] lead encontrado — id:', lead.id, 'nome:', lead.company_name, 'status:', lead.outreach_status)
    } else {
      console.log('[webhook] lead NÃO encontrado para phone:', phoneNumber)
      console.log('[webhook] phones no banco:', (leadsFound ?? []).map((l) => String(l.phone ?? '').replace(/\D/g, '').slice(-11)))
    }

    // ── Verificar se é número de teste e salvar mensagem ─────────────────────
    const msgData = data?.message as Record<string, unknown> | null
    console.log('[webhook] --- EXTRAÇÃO DE TEXTO ---')
    console.log('[webhook] message completo:', JSON.stringify(msgData, null, 2))

    const text = (
      (msgData?.conversation as string) ??
      ((msgData?.extendedTextMessage as Record<string, unknown>)?.text as string) ??
      ''
    ).trim()

    console.log('[webhook] texto extraído:', text || '(vazio)')

    if (!text) {
      console.log('[webhook] texto vazio — não salvar mensagem')
    } else {
      const { data: testNums } = await supabase
        .from('test_numbers')
        .select('id, phone')
        .not('phone', 'is', null)

      console.log('[webhook] test_numbers cadastrados:', (testNums ?? []).map((n: { phone: string }) => String(n.phone ?? '').replace(/\D/g, '').slice(-11)))

      const matchedTest = (testNums ?? []).find((n: { phone: string }) => {
        return String(n.phone ?? '').replace(/\D/g, '').slice(-11) === phoneNumber
      })

      console.log('[webhook] match em test_numbers:', matchedTest ? 'SIM' : 'NÃO')

      if (matchedTest) {
        console.log('[webhook] número de teste — salvando mensagem inbound')
        const { error: insertErr } = await supabase.from('test_messages').insert({
          phone:     phoneNumber,
          direction: 'inbound',
          content:   text,
        })
        console.log('[webhook] insert test_messages error:', insertErr)
      }
    }

  } catch (err) {
    console.error('[webhook] erro:', err instanceof Error ? err.message : err)
  }
}

// POST /api/webhook/whatsapp
export async function POST(req: NextRequest) {
  console.log('[webhook] INICIO - recebido request')

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  processIncoming(body)

  return new Response('OK', { status: 200 })
}
