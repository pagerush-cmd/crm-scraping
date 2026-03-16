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

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
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
    // senderPn pode estar em data.senderPn (Evolution v2) ou key.senderPn
    const senderPn  = String(data?.senderPn ?? key?.senderPn ?? '')

    console.log('[webhook] fromMe:', fromMe, '| remoteJid:', remoteJid, '| senderPn:', senderPn, '| source:', data?.source, '| pushName:', data?.pushName)

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
      // Buscar test_numbers e leads com lid_jid em paralelo
      const [testNumsRes, leadsLidRes] = await Promise.all([
        supabase.from('test_numbers').select('phone, lid_jid'),
        supabase.from('leads').select('id, phone, lid_jid').not('lid_jid', 'is', null),
      ])

      console.log('[webhook] @lid lookup — test_numbers:', testNumsRes.data?.length ?? 0, '| leads com lid_jid:', leadsLidRes.data?.length ?? 0)

      // 1. Match exato em test_numbers
      const byExactTestLid = (testNumsRes.data ?? []).find((n: { phone: string; lid_jid: string | null }) =>
        n.lid_jid === remoteJid
      )
      if (byExactTestLid) {
        phoneNumber = String(byExactTestLid.phone).replace(/\D/g, '').slice(-11)
        console.log('[webhook] @lid match exato test_number:', phoneNumber)
      } else {
        // 2. Match exato em leads
        const byExactLeadLid = (leadsLidRes.data ?? []).find((n: { phone: string; lid_jid: string | null }) =>
          n.lid_jid === remoteJid
        )
        if (byExactLeadLid) {
          phoneNumber = String(byExactLeadLid.phone).replace(/\D/g, '').slice(-11)
          console.log('[webhook] @lid match exato lead:', phoneNumber)
        } else {
          // 3. Fallback test_numbers: só se há exatamente 1 com @s.whatsapp.net
          const testFallbacks = (testNumsRes.data ?? []).filter((n: { phone: string; lid_jid: string | null }) =>
            n.lid_jid?.includes('@s.whatsapp.net')
          )
          if (testFallbacks.length === 1) {
            phoneNumber = String(testFallbacks[0].phone).replace(/\D/g, '').slice(-11)
            supabase.from('test_numbers').update({ lid_jid: remoteJid }).eq('phone', testFallbacks[0].phone).then(() => {})
            console.log('[webhook] @lid fallback test_number (único):', phoneNumber)
          } else {
            // 4. Fallback leads: só se há exatamente 1 com @s.whatsapp.net
            const leadFallbacks = (leadsLidRes.data ?? []).filter((n: { phone: string; lid_jid: string | null }) =>
              n.lid_jid?.includes('@s.whatsapp.net')
            )
            if (leadFallbacks.length === 1) {
              phoneNumber = String(leadFallbacks[0].phone).replace(/\D/g, '').slice(-11)
              supabase.from('leads').update({ lid_jid: remoteJid }).eq('id', (leadFallbacks[0] as Record<string, unknown>).id).then(() => {})
              console.log('[webhook] @lid fallback lead (único):', phoneNumber)
            } else {
              console.log('[webhook] @lid sem match único — remoteJid:', remoteJid, '| test fallbacks:', testFallbacks.length, '| lead fallbacks:', leadFallbacks.length)
              return
            }
          }
        }
      }
    } else {
      console.log('[webhook] formato desconhecido — remoteJid:', remoteJid)
      return
    }

    if (!phoneNumber) return

    // ── Buscar test_numbers e leads em paralelo ──────────────────────────────
    const [testNumsRes, leadsRes] = await Promise.all([
      supabase.from('test_numbers').select('id, phone').not('phone', 'is', null),
      supabase.from('leads').select('id, company_name, phone, outreach_status').not('phone', 'is', null),
    ])

    const matchedTest = (testNumsRes.data ?? []).find((n: { phone: string }) =>
      String(n.phone ?? '').replace(/\D/g, '').slice(-11) === phoneNumber
    )

    const matchedLead = (leadsRes.data ?? []).find((n: { phone: string }) =>
      String(n.phone ?? '').replace(/\D/g, '').slice(-11) === phoneNumber
    ) as Record<string, unknown> | undefined

    console.log('[webhook] phone:', phoneNumber, '| test:', matchedTest ? 'SIM' : 'NÃO', '| lead:', matchedLead ? matchedLead.company_name : 'NÃO')

    if (!matchedTest && !matchedLead) return

    // ════════════════════════════════════════════════════════════════════════
    // CAMINHO A — Número de teste
    // ════════════════════════════════════════════════════════════════════════
    if (matchedTest) {
      await supabase.from('test_messages').insert({
        phone:     phoneNumber,
        direction: 'inbound',
        content:   text,
      })

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

      const history     = (historyRes.data ?? []).reverse()
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

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const completion = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 500,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: text }],
      })

      const reply = completion.content[0].type === 'text' ? completion.content[0].text.trim() : ''
      console.log('[webhook] reply IA (teste):', reply.substring(0, 80))

      if (reply.toUpperCase().includes('HANDOFF')) {
        console.log('[webhook] HANDOFF — não responder')
        return
      }

      const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
      const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
      const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''

      if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
        console.log('[webhook] Evolution não configurada')
        return
      }

      const evoRes = await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body:    JSON.stringify({ number: `55${phoneNumber}`, text: reply }),
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

      console.log('[webhook] resposta enviada para teste:', phoneNumber)
      return
    }

    // ════════════════════════════════════════════════════════════════════════
    // CAMINHO B — Lead real
    // ════════════════════════════════════════════════════════════════════════
    if (matchedLead) {
      const leadId = String(matchedLead.id)

      // Salvar inbound
      await supabase.from('messages').insert({
        lead_id:   leadId,
        direction: 'inbound',
        channel:   'whatsapp',
        content:   text,
        status:    'received',
      })

      // Atualizar status do lead
      const currentStatus = String(matchedLead.outreach_status ?? '')
      if (['contacted', 'replied'].includes(currentStatus)) {
        await supabase.from('leads').update({ outreach_status: 'replied' }).eq('id', leadId)
      }

      // Buscar histórico, enrichment e settings em paralelo
      const [historyRes, enrichedLeadRes, settingsRes] = await Promise.all([
        supabase
          .from('messages')
          .select('direction, content')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('leads')
          .select(`id, company_name, phone, address, category, website,
            lead_enrichment(design_score, tech_score, audit, outreach_message, normalized_website)`)
          .eq('id', leadId)
          .single(),
        supabase.from('settings').select('key, value'),
      ])

      const s = Object.fromEntries((settingsRes.data ?? []).map((r) => [r.key, r.value as string]))

      const lead       = enrichedLeadRes.data as Record<string, unknown> | null
      const enrichRaw  = lead?.lead_enrichment
      const enrichment = Array.isArray(enrichRaw) ? enrichRaw[0] : enrichRaw as Record<string, unknown> | null
      const audit      = enrichment?.audit as { weak_points?: string[]; quick_wins?: string[] } | null

      const history     = (historyRes.data ?? []).reverse()
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
        company_name:            String(lead?.company_name  ?? ''),
        category:                String(lead?.category      ?? ''),
        address:                 String(lead?.address       ?? ''),
        website:                 String(enrichment?.normalized_website ?? lead?.website ?? 'sem site'),
        design_score:            enrichment?.design_score != null ? String(enrichment.design_score) : 'N/A',
        weak_points:             JSON.stringify(audit?.weak_points  ?? []),
        quick_wins:              JSON.stringify(audit?.quick_wins   ?? []),
        outreach_message:        String(enrichment?.outreach_message ?? ''),
        conversation_history:    historyText,
      }

      const systemPrompt = fillTemplate(s.prompt_agent_reply ?? '', templateVars)

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const completion = await anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 500,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: text }],
      })

      const reply = completion.content[0].type === 'text' ? completion.content[0].text.trim() : ''
      console.log('[webhook] reply IA (lead):', reply.substring(0, 80))

      if (reply.toUpperCase().includes('HANDOFF')) {
        await supabase.from('leads').update({ outreach_status: 'qualified' }).eq('id', leadId)
        console.log('[webhook] HANDOFF — lead qualificado:', matchedLead.company_name)
        return
      }

      const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
      const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
      const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''

      if (!evolutionUrl || !evolutionKey || !evolutionInstance) {
        console.log('[webhook] Evolution não configurada')
        return
      }

      const targetPhone = normalizePhone(String(matchedLead.phone ?? ''))
      const evoRes = await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
        body:    JSON.stringify({ number: targetPhone, text: reply }),
      })

      if (!evoRes.ok) {
        const errText = await evoRes.text().catch(() => evoRes.statusText)
        console.log('[webhook] Evolution error (lead):', evoRes.status, errText)
        return
      }

      await supabase.from('messages').insert({
        lead_id:   leadId,
        direction: 'outbound',
        channel:   'whatsapp',
        content:   reply,
        status:    'sent',
      })

      console.log('[webhook] resposta enviada para lead:', matchedLead.company_name)
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
