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
    console.log('[webhook] participant:', (body?.data as Record<string, unknown>)?.participant)
    console.log('[webhook] data keys:', Object.keys((body?.data as Record<string, unknown>) || {}))
    if (event !== 'messages.upsert') return

    const data    = body.data    as Record<string, unknown>
    const key     = data?.key    as Record<string, unknown>
    const fromMe  = key?.fromMe  as boolean
    const remoteJid: string = String(key?.remoteJid ?? '')
    const senderPn: string  = String(key?.senderPn  ?? '')
    const participant: string = String(data?.participant ?? '')

    console.log('[webhook] fromMe:', fromMe)
    console.log('[webhook] remoteJid:', remoteJid)
    console.log('[webhook] senderPn:', senderPn)
    console.log('[webhook] participant:', participant)
    console.log('[webhook] body.data completo:', JSON.stringify(data, null, 2))

    if (fromMe) return

    // Ignorar grupos
    if (remoteJid.endsWith('@g.us')) return

    // Extrair texto da mensagem (vários formatos possíveis)
    const msgObj = data?.message as Record<string, unknown> | null
    const text   = (
      (msgObj?.conversation as string) ??
      (msgObj?.extendedTextMessage as Record<string, unknown>)?.text as string ??
      ''
    ).trim()

    if (!text) return

    const supabase = createServiceClient()

    // ── Identificar lead ─────────────────────────────────────────────────────
    // Prioridade: senderPn > remoteJid @s.whatsapp.net > lid_jid salvo

    type LeadRow = { id: string; phone: string | null; outreach_status: string; status: string; lid_jid?: string | null }
    let lead: LeadRow | undefined
    let phoneNumber: string | null = null

    // Extrai phone11 (11 dígitos, sem DDI 55) de um JID @s.whatsapp.net
    function toPhone11(jid: string): string {
      const raw = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
      return raw.length === 13 && raw.startsWith('55') ? raw.substring(2) : raw.slice(-11)
    }

    // Busca lead por phone11 comparando contra todos os leads já contactados
    async function findLeadByPhone(phone11: string): Promise<LeadRow | undefined> {
      console.log('[webhook] executando query para phone:', phone11)
      const { data: leadsFound, error: leadsError } = await supabase
        .from('leads')
        .select('id, phone, outreach_status, status')
        .neq('outreach_status', 'new')
        .not('phone', 'is', null)
      console.log('[webhook] supabase error:', leadsError)
      console.log('[webhook] supabase data:', leadsFound)
      const found = (leadsFound ?? [] as LeadRow[]).find((l) => {
        return String(l.phone ?? '').replace(/\D/g, '').slice(-11) === phone11
      })
      console.log('[webhook] lead match:', found ? found.id : 'NÃO ENCONTRADO')
      return found
    }

    // 1. Prioridade máxima: senderPn (número real do lead, presente no WA Business)
    if (senderPn.includes('@s.whatsapp.net')) {
      phoneNumber = toPhone11(senderPn)
      console.log('[webhook] phoneNumber via senderPn:', phoneNumber)
      lead = await findLeadByPhone(phoneNumber)

    // 2. remoteJid normal
    } else if (remoteJid.includes('@s.whatsapp.net')) {
      phoneNumber = toPhone11(remoteJid)
      console.log('[webhook] phoneNumber via remoteJid:', phoneNumber)
      lead = await findLeadByPhone(phoneNumber)

    // 3. Fallback: lid_jid salvo no banco
    } else if (remoteJid.includes('@lid')) {
      console.log('[webhook] fallback lid_jid:', remoteJid)

      const { data: byLid } = await supabase
        .from('leads')
        .select('id, phone, outreach_status, status, lid_jid')
        .eq('lid_jid', remoteJid)
        .neq('outreach_status', 'new')
        .maybeSingle()

      if (byLid) {
        lead = byLid as LeadRow
        console.log('[webhook] lead encontrado via lid_jid:', lead.id)
      } else if (participant.includes('@s.whatsapp.net')) {
        phoneNumber = toPhone11(participant)
        console.log('[webhook] tentando por participant phone11:', phoneNumber)
        lead = await findLeadByPhone(phoneNumber)
        if (lead) {
          await supabase
            .from('leads')
            .update({ lid_jid: remoteJid })
            .eq('id', lead.id)
            .then(({ error }) => { if (error) console.warn('[webhook] falha ao salvar lid_jid:', error) })
        }
      } else {
        console.log('[webhook] @lid sem senderPn/participant — não foi possível identificar o lead')
        return
      }
    } else {
      console.log('[webhook] formato de remoteJid desconhecido:', remoteJid)
      return
    }

    console.log('[webhook] lead encontrado:', lead ? lead.id : 'NÃO ENCONTRADO')
    console.log('[webhook] lead phone:', lead?.phone ?? '—')

    if (!lead) {
      console.log('[webhook] lead não encontrado')
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
    const leadDigits  = String(lead.phone ?? '').replace(/\D/g, '')
    const targetPhone = leadDigits.startsWith('55') ? leadDigits : `55${leadDigits}`
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
