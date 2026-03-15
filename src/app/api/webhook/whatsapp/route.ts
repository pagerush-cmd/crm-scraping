import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// Processa a mensagem em background (não bloqueia o 200 OK)
async function processIncoming(body: Record<string, unknown>) {
  try {
    console.log('[webhook] recebido:', JSON.stringify(body, null, 2))

    const event = body.event as string
    console.log('[webhook] event:', event)
    if (event !== 'messages.upsert') return

    const data    = body.data    as Record<string, unknown>
    const key     = data?.key    as Record<string, unknown>
    const fromMe  = key?.fromMe  as boolean

    console.log('[webhook] fromMe:', fromMe)
    console.log('[webhook] remoteJid:', key?.remoteJid)
    console.log('[webhook] message:', data?.message)

    if (fromMe) return

    const remoteJid: string = String(key?.remoteJid ?? '')
    const sender:    string = String(body.sender    ?? '')

    // Ignorar grupos
    if (remoteJid.endsWith('@g.us')) return

    // ── Extrair número do lead ───────────────────────────────────────────────
    // remoteJid pode vir em dois formatos:
    //   • "5511959356529@s.whatsapp.net" → número real
    //   • "210986124488877@lid"          → ID interno do WhatsApp Business
    // Se for @lid, usar o campo sender (que sempre vem como número real)

    let rawPhone: string

    if (remoteJid.includes('@s.whatsapp.net')) {
      rawPhone = remoteJid.replace('@s.whatsapp.net', '')
    } else if (remoteJid.includes('@lid')) {
      console.log('[webhook] remoteJid é @lid — usando sender:', sender)
      rawPhone = sender.replace('@s.whatsapp.net', '')
    } else {
      console.log('[webhook] formato de remoteJid desconhecido:', remoteJid)
      return
    }

    // Normalizar: só dígitos, 11 dígitos sem DDI para comparação
    const digitsRaw = rawPhone.replace(/\D/g, '')
    // Remove o DDI 55 se vier com 13 dígitos (55 + 2 DDD + 9 número)
    const phone11 = digitsRaw.length === 13 && digitsRaw.startsWith('55')
      ? digitsRaw.slice(2)
      : digitsRaw.slice(-11)

    console.log('[webhook] phoneNumber final (phone11):', phone11)

    // Extrair texto da mensagem (vários formatos possíveis)
    const msgObj = data?.message as Record<string, unknown> | null
    const text   = (
      (msgObj?.conversation as string) ??
      (msgObj?.extendedTextMessage as Record<string, unknown>)?.text as string ??
      ''
    ).trim()

    if (!text) return

    const supabase = createServiceClient()

    // Buscar todos os leads contactados e comparar últimos 11 dígitos
    const { data: leadsFound } = await supabase
      .from('leads')
      .select('id, phone, outreach_status, status')
      .neq('outreach_status', 'new')
      .not('phone', 'is', null)

    const lead = (leadsFound ?? []).find((l) => {
      const lp = String(l.phone ?? '').replace(/\D/g, '').slice(-11)
      return lp === phone11
    })

    console.log('[webhook] lead encontrado:', lead ? lead.id : 'NÃO ENCONTRADO')
    console.log('[webhook] lead phone:', lead?.phone ?? '—')

    if (!lead) {
      console.log('[webhook] lead não encontrado para phone11:', phone11, '| rawPhone:', rawPhone)
      return
    }

    // Salvar mensagem inbound
    await supabase.from('messages').insert({
      lead_id:   lead.id,
      direction: 'inbound',
      channel:   'whatsapp',
      content:   text,
      status:    'received',
    })

    // Se waiting_human → só salvar, não chamar IA
    if (lead.outreach_status === 'waiting_human') {
      console.log('[webhook] lead em waiting_human — salvou msg, sem IA:', lead.id)
      return
    }

    // Atualizar outreach_status para 'responding'
    await supabase
      .from('leads')
      .update({ outreach_status: 'responding' })
      .eq('id', lead.id)

    // Buscar histórico (últimas 10 mensagens, excluindo a atual)
    const { data: history } = await supabase
      .from('messages')
      .select('direction, content')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(10)

    const conversationHistory = (history ?? [])
      .reverse()
      .map((m) => ({
        role:    m.direction === 'outbound' ? 'assistant' : 'user',
        content: m.content as string,
      }))

    // Chamar agent-reply internamente
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const replyRes = await fetch(`${baseUrl}/api/outreach/agent-reply`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        lead_id:              lead.id,
        last_message:         text,
        conversation_history: conversationHistory,
      }),
    })

    const replyData: { message?: string; handoff?: boolean; error?: string } = await replyRes.json()

    if (replyData.handoff) {
      await supabase
        .from('leads')
        .update({ outreach_status: 'waiting_human' })
        .eq('id', lead.id)
      console.log('[webhook] HANDOFF — lead:', lead.id)
      return
    }

    const agentMsg = replyData.message
    if (!agentMsg) {
      console.log('[webhook] agent-reply retornou mensagem vazia:', replyData.error)
      return
    }

    // Buscar configurações de Evolution
    const { data: settingsRows } = await supabase.from('settings').select('key, value')
    const s = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value as string]))

    const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
    const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
    const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''

    if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
      console.log('[webhook] Evolution API não configurada')
      return
    }

    // Enviar resposta via Evolution (sempre com DDI 55)
    const targetPhone = digitsRaw.startsWith('55') ? digitsRaw : `55${digitsRaw}`
    const evoRes = await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
      body:    JSON.stringify({ number: targetPhone, text: agentMsg }),
    })

    if (!evoRes.ok) {
      const errText = await evoRes.text().catch(() => evoRes.statusText)
      console.log('[webhook] Erro ao enviar via Evolution:', evoRes.status, errText)
      return
    }

    // Salvar mensagem outbound
    await supabase.from('messages').insert({
      lead_id:   lead.id,
      direction: 'outbound',
      channel:   'whatsapp',
      content:   agentMsg,
      status:    'sent',
    })

    console.log('[webhook] resposta enviada para lead:', lead.id)
  } catch (err) {
    console.error('[webhook] erro no processamento:', err instanceof Error ? err.message : err)
  }
}

// POST /api/webhook/whatsapp
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response('OK', { status: 200 })
  }

  // Responder 200 imediatamente e processar em background
  processIncoming(body)

  return new Response('OK', { status: 200 })
}
