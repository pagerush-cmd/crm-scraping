import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

// Vercel: increase timeout for long-running dispatch
export const maxDuration = 300

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function enc(data: object) {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

// POST /api/outreach/start — returns SSE
export async function POST(req: NextRequest) {
  let body: { campaign_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('data: {"type":"error","error":"Body inválido"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const { campaign_id } = body

  if (!campaign_id) {
    return new Response('data: {"type":"error","error":"campaign_id obrigatório"}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => controller.enqueue(enc(data))

      try {
        const supabase = createServiceClient()

        // ── 1. Fetch all settings ────────────────────────────────────────────
        const { data: settingsRows } = await supabase.from('settings').select('key, value')
        const s = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value as string]))

        const evolutionUrl      = s.evolution_api_url      ?? process.env.EVOLUTION_API_URL      ?? ''
        const evolutionKey      = s.evolution_api_key      ?? process.env.EVOLUTION_API_KEY      ?? ''
        const evolutionInstance = s.evolution_instance_name ?? process.env.EVOLUTION_INSTANCE_NAME ?? ''
        const dailyLimit        = parseInt(s.outreach_daily_limit ?? '30') || 30
        const delayMin          = parseInt(s.outreach_delay_min   ?? '30') || 30
        const delayMax          = parseInt(s.outreach_delay_max   ?? '120') || 120
        const promptFirst       = s.prompt_first_message ?? ''

        const templateVars: Record<string, string> = {
          agent_name:              s.agent_name              ?? '',
          service_description:     s.service_description     ?? '',
          service_price:           s.service_price           ?? '',
          service_delivery_days:   s.service_delivery_days   ?? '',
          service_payment_methods: s.service_payment_methods ?? '',
          portfolio_url:           s.portfolio_url            ?? '',
        }

        // ── 2. Fetch leads with enrichment ───────────────────────────────────
        const { data: rawLeads, error: leadsError } = await supabase
          .from('leads')
          .select(`
            id, company_name, phone, address, category, website,
            lead_enrichment(design_score, tech_score, audit, outreach_message, normalized_website)
          `)
          .eq('campaign_id', campaign_id)
          .eq('outreach_status', 'new')
          .not('phone', 'is', null)
          .limit(dailyLimit)

        if (leadsError) {
          send({ type: 'error', company_name: '', error: leadsError.message })
          controller.close()
          return
        }

        const leads = rawLeads ?? []
        const total = leads.length

        if (total === 0) {
          send({ type: 'done', total_sent: 0, total_errors: 0 })
          controller.close()
          return
        }

        // ── 3. Process each lead ─────────────────────────────────────────────
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        let totalSent   = 0
        let totalErrors = 0

        for (let i = 0; i < leads.length; i++) {
          const lead = leads[i] as Record<string, unknown>
          const enrichRaw  = lead.lead_enrichment
          const enrichment = Array.isArray(enrichRaw) ? enrichRaw[0] : enrichRaw as Record<string, unknown> | null
          const audit      = enrichment?.audit as { weak_points?: string[]; quick_wins?: string[] } | null

          // 3a. Build prompt
          const vars: Record<string, string> = {
            ...templateVars,
            company_name:    String(lead.company_name ?? ''),
            category:        String(lead.category     ?? ''),
            address:         String(lead.address      ?? ''),
            website:         String(enrichment?.normalized_website ?? lead.website ?? 'sem site'),
            design_score:    enrichment?.design_score != null ? String(enrichment.design_score) : 'N/A',
            weak_points:     JSON.stringify(audit?.weak_points  ?? []),
            quick_wins:      JSON.stringify(audit?.quick_wins   ?? []),
            outreach_message: String(enrichment?.outreach_message ?? ''),
          }

          const prompt = fillTemplate(promptFirst, vars)

          // 3c. SSE: sending
          send({ type: 'progress', company_name: lead.company_name, status: 'sending' })

          try {
            // 3b. Claude API
            const completion = await anthropic.messages.create({
              model:      'claude-sonnet-4-6',
              max_tokens: 500,
              messages:   [{ role: 'user', content: prompt }],
            })
            const message = completion.content[0].type === 'text'
              ? completion.content[0].text.trim()
              : ''

            // 3d. Evolution API
            const targetPhone = normalizePhone(String(lead.phone ?? ''))

            const evolutionRes = await fetch(
              `${evolutionUrl}/message/sendText/${evolutionInstance}`,
              {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', apikey: evolutionKey },
                body:    JSON.stringify({ number: targetPhone, text: message }),
              }
            )

            if (!evolutionRes.ok) {
              const errText = await evolutionRes.text().catch(() => evolutionRes.statusText)
              throw new Error(`Evolution API: ${evolutionRes.status} — ${errText}`)
            }

            // 3e. Save message
            await supabase.from('messages').insert({
              lead_id:   lead.id,
              direction: 'outbound',
              channel:   'whatsapp',
              content:   message,
              status:    'sent',
            })

            // 3f. Update lead outreach_status
            await supabase
              .from('leads')
              .update({ outreach_status: 'contacted' })
              .eq('id', lead.id)

            // 3g. SSE: sent
            send({
              type:            'sent',
              company_name:    lead.company_name,
              message_preview: message.substring(0, 80),
            })
            totalSent++

          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            send({ type: 'error', company_name: lead.company_name, error: errMsg })
            totalErrors++
          }

          // 3h. Delay (skip after last lead)
          if (i < leads.length - 1) {
            const delaySec = Math.random() * (delayMax - delayMin) + delayMin
            await sleep(delaySec * 1000)
          }
        }

        // ── 4. Done ──────────────────────────────────────────────────────────
        send({ type: 'done', total_sent: totalSent, total_errors: totalErrors })
        controller.close()

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        send({ type: 'error', company_name: '', error: errMsg })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
