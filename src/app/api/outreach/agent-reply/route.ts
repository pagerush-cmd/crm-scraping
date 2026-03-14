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

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

interface HistoryMessage {
  role:    'user' | 'assistant'
  content: string
}

// POST /api/outreach/agent-reply
// body: { lead_id, last_message, conversation_history, test_number? }
// returns: { message } | { handoff: true }
export async function POST(req: NextRequest) {
  let body: {
    lead_id:              string
    last_message:         string
    conversation_history: HistoryMessage[]
    test_number?:         string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { lead_id, last_message, conversation_history, test_number } = body

  try {
    const supabase = createServiceClient()

    // Fetch settings
    const { data: settingsRows } = await supabase.from('settings').select('key, value')
    const s = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value as string]))

    // Fetch lead + enrichment
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select(`id, company_name, phone, address, category, website,
        lead_enrichment(design_score, tech_score, audit, outreach_message, normalized_website)`)
      .eq('id', lead_id)
      .single()

    if (leadError || !leadData) {
      return Response.json({ error: 'Lead não encontrado.' }, { status: 404 })
    }

    const lead       = leadData as Record<string, unknown>
    const enrichRaw  = lead.lead_enrichment
    const enrichment = Array.isArray(enrichRaw) ? enrichRaw[0] : enrichRaw as Record<string, unknown> | null
    const audit      = enrichment?.audit as { weak_points?: string[]; quick_wins?: string[] } | null

    const templateVars: Record<string, string> = {
      agent_name:              s.agent_name              ?? '',
      service_description:     s.service_description     ?? '',
      service_price:           s.service_price           ?? '',
      service_delivery_days:   s.service_delivery_days   ?? '',
      service_payment_methods: s.service_payment_methods ?? '',
      portfolio_url:           s.portfolio_url            ?? '',
      company_name:            String(lead.company_name  ?? ''),
      category:                String(lead.category      ?? ''),
      address:                 String(lead.address       ?? ''),
      website:                 String(enrichment?.normalized_website ?? lead.website ?? 'sem site'),
      design_score:            enrichment?.design_score != null ? String(enrichment.design_score) : 'N/A',
      weak_points:             JSON.stringify(audit?.weak_points  ?? []),
      quick_wins:              JSON.stringify(audit?.quick_wins   ?? []),
      outreach_message:        String(enrichment?.outreach_message ?? ''),
    }

    const systemPrompt = fillTemplate(s.prompt_agent_reply ?? '', templateVars)

    // Build messages array: prior history + new lead message
    const messages: Anthropic.MessageParam[] = [
      ...conversation_history.map((m) => ({
        role:    m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: last_message },
    ]

    // Call Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const completion = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 500,
      system:     systemPrompt,
      messages,
    })

    const reply = completion.content[0].type === 'text' ? completion.content[0].text.trim() : ''

    if (reply.toUpperCase().includes('HANDOFF')) {
      return Response.json({ handoff: true })
    }

    // Send via Evolution API if test_number provided
    if (test_number) {
      const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
      const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
      const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''

      if (evolutionUrl && evolutionKey && evolutionInstance) {
        await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
          body:    JSON.stringify({ number: normalizePhone(test_number), text: reply }),
        }).catch(() => {/* non-fatal */})
      }
    }

    return Response.json({ message: reply })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
