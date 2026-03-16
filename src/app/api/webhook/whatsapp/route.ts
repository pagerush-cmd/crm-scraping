import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

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

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
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

    // ── Resolver phoneNumber ─────────────────────────────────────────────────
    let phoneNumber: string | null = null

    if (senderPn.includes('@s.whatsapp.net')) {
      phoneNumber = toPhone11(senderPn)
    } else if (remoteJid.includes('@s.whatsapp.net')) {
      phoneNumber = toPhone11(remoteJid)
    } else if (remoteJid.includes('@lid')) {
      const { data: allTestNums } = await supabase
        .from('test_numbers')
        .select('phone, lid_jid')

      const byExactLid = (allTestNums ?? []).find((n: { phone: string; lid_jid: string | null }) =>
        n.lid_jid === remoteJid
      )
      if (byExactLid) {
        phoneNumber = String(byExactLid.phone).replace(/\D/g, '').slice(-11)
      } else {
        const fallback = (allTestNums ?? []).find((n: { phone: string; lid_jid: string | null }) =>
          n.lid_jid?.includes('@s.whatsapp.net')
        )
        if (fallback) {
          phoneNumber = String(fallback.phone).replace(/\D/g, '').slice(-11)
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

    if (!phoneNumber) return

    // ── Buscar leads e test_numbers em paralelo ──────────────────────────────
    const [leadsRes, testNumsRes] = await Promise.all([
      supabase.from('leads').select('id, company_name, phone, outreach_status').not('phone', 'is', null),
      supabase.from('test_numbers').select('id, phone').not('phone', 'is', null),
    ])

    const matchedTest = (testNumsRes.data ?? []).find((n: { phone: string }) =>
      String(n.phone ?? '').replace(/\D/g, '').slice(-11) === phoneNumber
    )

    console.log('[webhook] phone:', phoneNumber, '| test_number:', matchedTest ? 'SIM' : 'NÃO')

    if (!matchedTest) return

    // ── Salvar mensagem inbound ──────────────────────────────────────────────
    await supabase.from('test_messages').insert({
      phone:     phoneNumber,
      direction: 'inbound',
      content:   text,
    })

    // ── Fase 2: gerar resposta com IA ────────────────────────────────────────

    // Buscar histórico, lead enriquecido e settings em paralelo
    const [historyRes, enrichedLeadRes, settingsRes] = await Promise.all([
      supabase
        .from('test_messages')
        .select('direction, content')
        .eq('phone', phoneNumber)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('leads')
        .select(`id, company_name, phone, address, category, website,
          lead_enrichment(design_score, tech_score, audit, outreach_message, normalized_website)`)
        .not('lead_enrichment', 'is', null)
        .limit(1)
        .maybeSingle(),
      supabase.from('settings').select('key, value'),
    ])

    const s = Object.fromEntries((settingsRes.data ?? []).map((r) => [r.key, r.value as string]))

    const contextLead = enrichedLeadRes.data as Record<string, unknown> | null
    const enrichRaw   = contextLead?.lead_enrichment
    const enrichment  = Array.isArray(enrichRaw) ? enrichRaw[0] : enrichRaw as Record<string, unknown> | null
    const audit       = enrichment?.audit as { weak_points?: string[]; quick_wins?: string[] } | null

    // Histórico formatado: mais antigo primeiro, atual já incluído
    const history = (historyRes.data ?? []).reverse()
    const historyText = history
      .map((m: { direction: string; content: string }) =>
        m.direction === 'outbound' ? `Ana: ${m.content}` : `Lead: ${m.content}`
      )
      .join('\n')

    const templateVars: Record<string, string> = {
      agent_name:              s.agent_name              ?? '',
      service_description:     s.service_description     ?? '',
      service_price:           s.service_price           ?? '',
      service_delivery_days:   s.service_delivery_days   ?? '',
      service_payment_methods: s.service_payment_methods ?? '',
      portfolio_url:           s.portfolio_url            ?? '',
      company_name:            String(contextLead?.company_name  ?? 'Lead de Teste'),
      category:                String(contextLead?.category      ?? ''),
      address:                 String(contextLead?.address       ?? ''),
      website:                 String(enrichment?.normalized_website ?? contextLead?.website ?? 'sem site'),
      design_score:            enrichment?.design_score != null ? String(enrichment.design_score) : 'N/A',
      weak_points:             JSON.stringify(audit?.weak_points  ?? []),
      quick_wins:              JSON.stringify(audit?.quick_wins   ?? []),
      outreach_message:        String(enrichment?.outreach_message ?? ''),
      conversation_history:    historyText,
    }

    const systemPrompt = fillTemplate(s.prompt_agent_reply ?? '', templateVars)

    // Chamar Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const completion = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 500,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: text }],
    })

    const reply = completion.content[0].type === 'text' ? completion.content[0].text.trim() : ''
    console.log('[webhook] reply IA:', reply.substring(0, 80))

    if (reply.toUpperCase().includes('HANDOFF')) {
      console.log('[webhook] HANDOFF — não responder')
      return
    }

    // Buscar configurações de Evolution
    const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
    const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
    const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''

    if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
      console.log('[webhook] Evolution não configurada')
      return
    }

    const targetPhone = `55${phoneNumber}`
    const evoRes = await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
      body:    JSON.stringify({ number: targetPhone, text: reply }),
    })

    if (!evoRes.ok) {
      const errText = await evoRes.text().catch(() => evoRes.statusText)
      console.log('[webhook] Evolution error:', evoRes.status, errText)
      return
    }

    await supabase.from('test_messages').insert({
      phone:     phoneNumber,
      direction: 'outbound',
      content:   reply,
    })

    console.log('[webhook] resposta enviada para:', phoneNumber)

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
