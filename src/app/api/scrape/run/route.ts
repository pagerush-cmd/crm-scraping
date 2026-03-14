import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

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

function parseQueryArray(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const arr = JSON.parse(match[0])
    return Array.isArray(arr) ? arr.filter((q: unknown) => typeof q === 'string') : []
  } catch {
    return []
  }
}

interface HasDataResult {
  title?:        string
  phone?:        string | null
  address?:      string | null
  website?:      string | null
  category?:     string | null
  rating?:       string | number | null
  reviewsCount?: string | number | null
}

// POST /api/scrape/run — returns SSE
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

        // ── 1. Fetch campaign ────────────────────────────────────────────────
        const { data: campaign, error: campaignError } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaign_id)
          .single()

        if (campaignError || !campaign) {
          send({ type: 'error', error: 'Campanha não encontrada.' })
          controller.close()
          return
        }

        // ── 2. Fetch settings ────────────────────────────────────────────────
        const { data: settingsRows } = await supabase.from('settings').select('key, value')
        const s = Object.fromEntries((settingsRows ?? []).map((r) => [r.key, r.value as string]))

        const hasdataKey = s.hasdata_api_key ?? process.env.HASDATA_API_KEY ?? ''
        if (!hasdataKey) {
          send({ type: 'error', error: 'HASDATA_API_KEY não configurado nas settings.' })
          controller.close()
          return
        }

        // ── 3. Generate queries via Claude ───────────────────────────────────
        send({ type: 'status', message: 'Gerando queries de busca com IA…' })

        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
        const completion = await anthropic.messages.create({
          model:      'claude-sonnet-4-6',
          max_tokens: 300,
          messages:   [{
            role:    'user',
            content: `Gere 5 queries de busca para o Google Maps para encontrar empresas do nicho "${campaign.niche}" na cidade "${campaign.city}".
Retorne APENAS um array JSON com as queries, sem explicações.
Exemplo: ["personal trainers São Paulo SP", "personal trainer academia SP"]`,
          }],
        })

        const claudeText = completion.content[0].type === 'text' ? completion.content[0].text : '[]'
        const queries    = parseQueryArray(claudeText)

        if (queries.length === 0) {
          send({ type: 'error', error: 'Claude não retornou queries válidas.' })
          controller.close()
          return
        }

        send({ type: 'queries', queries })

        // ── 4. For each query: HasData + map + upsert ────────────────────────
        let totalSaved      = 0
        let totalDuplicates = 0

        for (const query of queries) {
          send({ type: 'query', query, status: 'searching' })

          try {
            const hasdataRes = await fetch(
              `https://api.hasdata.com/scrape/google-maps/search?q=${encodeURIComponent(query)}`,
              { headers: { 'x-api-key': hasdataKey } }
            )

            if (!hasdataRes.ok) {
              const errText = await hasdataRes.text().catch(() => hasdataRes.statusText)
              send({ type: 'query_error', query, error: `HasData ${hasdataRes.status}: ${errText}` })
              continue
            }

            const hasdataData = await hasdataRes.json() as {
              localResults?:   HasDataResult[]
              organicResults?: HasDataResult[]
            }
            const results: HasDataResult[] = hasdataData.localResults ?? hasdataData.organicResults ?? []

            send({ type: 'found', query, count: results.length })

            if (results.length === 0) continue

            const leadsToInsert = results
              .filter((r) => r.title)
              .map((r) => ({
                campaign_id,
                company_name:    r.title!,
                phone:           r.phone ? (String(r.phone).replace(/\D/g, '').slice(-11) || null) : null,
                address:         r.address      ?? null,
                website:         r.website      ?? null,
                category:        r.category     ?? campaign.niche,
                rating:          r.rating       ? (parseFloat(String(r.rating))    || null) : null,
                reviews_count:   r.reviewsCount ? (parseInt(String(r.reviewsCount)) || null) : null,
                source:          'google_maps',
                status:          'new',
                outreach_status: 'new',
              }))

            if (leadsToInsert.length === 0) continue

            const withPhone    = leadsToInsert.filter((l) => l.phone)
            const withoutPhone = leadsToInsert.filter((l) => !l.phone)

            let savedThisBatch = 0
            let dupeThisBatch  = 0

            if (withPhone.length > 0) {
              const { data: upserted } = await supabase
                .from('leads')
                .upsert(withPhone, { onConflict: 'campaign_id,phone', ignoreDuplicates: true })
                .select('id')
              savedThisBatch += upserted?.length ?? 0
              dupeThisBatch  += withPhone.length - (upserted?.length ?? 0)
            }

            if (withoutPhone.length > 0) {
              const { data: inserted } = await supabase
                .from('leads')
                .insert(withoutPhone)
                .select('id')
              savedThisBatch += inserted?.length ?? 0
            }

            totalSaved      += savedThisBatch
            totalDuplicates += dupeThisBatch

            send({
              type:        'saved',
              query,
              saved:       savedThisBatch,
              duplicates:  dupeThisBatch,
              total_saved: totalSaved,
            })

          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            send({ type: 'query_error', query, error: msg })
          }
        }

        // ── 5. Done ──────────────────────────────────────────────────────────
        send({ type: 'done', total_leads_saved: totalSaved, total_duplicates: totalDuplicates })
        controller.close()

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        send({ type: 'error', error: msg })
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
