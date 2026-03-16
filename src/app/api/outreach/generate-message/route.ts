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
  return Object.entries(vars).reduce((str, [key, value]) => {
    return str.replaceAll(`{{${key}}}`, value ?? '')
  }, template)
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

// POST /api/outreach/generate-message
// body: { lead_id?: string; test_number?: string }
// returns: { message, lead_id, company_name }
export async function POST(req: NextRequest) {
  let body: { lead_id?: string; test_number?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { lead_id, test_number } = body

  try {
    const supabase = createServiceClient()

    // Fetch settings
    const { data: settingsRows } = await supabase.from('settings').select('key, value')
    const s = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value as string]))

    const promptTemplate = s.prompt_first_message ?? ''
    console.log('[generate-message] prompt_first_message (primeiros 200):', promptTemplate.substring(0, 200))

    // Fetch lead + enrichment
    const baseQuery = supabase
      .from('leads')
      .select(`id, company_name, phone, address, category, website,
        lead_enrichment(design_score, tech_score, audit, outreach_message, normalized_website)`)
      .not('phone', 'is', null)

    const { data: leadData, error: leadError } = lead_id
      ? await baseQuery.eq('id', lead_id).single()
      : await baseQuery.eq('outreach_status', 'new').limit(1).single()

    if (leadError || !leadData) {
      console.log('[generate-message] leadError:', leadError)
      return Response.json({ error: 'Nenhum lead elegível encontrado.' }, { status: 404 })
    }

    const lead       = leadData as Record<string, unknown>
    const enrichRaw  = lead.lead_enrichment
    const enrichment = Array.isArray(enrichRaw) ? enrichRaw[0] : enrichRaw as Record<string, unknown> | null
    const audit      = enrichment?.audit as { weak_points?: string[]; quick_wins?: string[] } | null

    console.log('[generate-message] lead:', JSON.stringify(lead, null, 2))
    console.log('[generate-message] enrichment:', JSON.stringify(enrichment, null, 2))

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

    const prompt = fillTemplate(promptTemplate, templateVars)

    console.log('[generate-message] prompt montado (primeiros 200):', prompt.substring(0, 200))

    if (!prompt.trim()) {
      return Response.json(
        { error: 'O prompt está vazio. Configure o "Prompt — Primeira Mensagem" em /settings > Prompts IA.' },
        { status: 400 }
      )
    }

    // Call Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const completion = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 500,
      messages:   [{ role: 'user', content: prompt }],
    })
    const message = completion.content[0].type === 'text' ? completion.content[0].text.trim() : ''

    // Send via Evolution API if test_number provided
    if (test_number) {
      const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
      const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
      const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''

      if (evolutionUrl && evolutionKey && evolutionInstance) {
        await fetch(`${evolutionUrl}/message/sendText/${evolutionInstance}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
          body:    JSON.stringify({ number: normalizePhone(test_number), text: message }),
        }).catch(() => {/* non-fatal */})
      }

      // Salvar outbound em test_messages para polling do simulador
      const phone11 = normalizePhone(test_number).slice(-11)
      await supabase.from('test_messages').insert({ phone: phone11, direction: 'outbound', content: message })
    }

    return Response.json({
      message,
      lead_id:      String(lead.id),
      company_name: String(lead.company_name ?? ''),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log('[generate-message] erro:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
