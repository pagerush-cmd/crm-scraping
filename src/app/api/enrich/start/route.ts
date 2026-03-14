import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { emitEnrichEvent } from '@/lib/enrich-emitter'
import { takeScreenshot } from '@/lib/screenshot'

// ─── helpers ──────────────────────────────────────────────────────────────────

function normalizeUrl(url: string): string {
  url = url.trim()
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url
  }
  return url.replace(/^http:\/\//, 'https://')
}

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── types ────────────────────────────────────────────────────────────────────

interface LeadToEnrich {
  id: string
  campaign_id: string
  company_name: string
  website: string | null
}

// ─── screenshot loop (fire-and-forget) ────────────────────────────────────────

async function processScreenshots(
  supabase: ReturnType<typeof createServiceClient>,
  campaignId: string,
  leads: LeadToEnrich[]
) {
  const total       = leads.length
  let   success     = 0
  let   failed      = 0
  let   unavailable = 0

  for (let i = 0; i < leads.length; i++) {
    const lead          = leads[i]
    const current       = i + 1
    const normalizedUrl = normalizeUrl(lead.website!)

    try {
      // ── Stage: screenshot (falha não aborta o lead) ───────────────────────
      emitEnrichEvent(campaignId, {
        type: 'progress', current, total,
        lead_name: lead.company_name,
        stage: 'screenshot',
      })

      let screenshotUrl: string | null = null
      try {
        const imageBytes  = await takeScreenshot(normalizedUrl)

        // ── Stage: upload ──────────────────────────────────────────────────
        emitEnrichEvent(campaignId, {
          type: 'progress', current, total,
          lead_name: lead.company_name,
          stage: 'upload',
        })

        const storagePath = `${campaignId}/${lead.id}.jpg`
        const { error: uploadError } = await supabase.storage
          .from('screenshots')
          .upload(storagePath, imageBytes, { contentType: 'image/jpeg', upsert: true })

        if (uploadError) throw new Error(`Upload falhou: ${uploadError.message}`)

        const { data: urlData } = supabase.storage.from('screenshots').getPublicUrl(storagePath)
        screenshotUrl = urlData.publicUrl
      } catch (screenshotErr) {
        console.warn(
          `[enrich] Screenshot falhou para ${lead.company_name} (${normalizedUrl}) — continuando sem imagem:`,
          screenshotErr
        )
        // Salvar status intermediário para indicar falha de screenshot mas continuar
        await supabase
          .from('lead_enrichment')
          .upsert(
            {
              lead_id:            lead.id,
              campaign_id:        campaignId,
              status:             'screenshot_failed',
              normalized_website: normalizedUrl,
              audit: {
                screenshot_url: null,
                screenshot_error: screenshotErr instanceof Error ? screenshotErr.message : 'Erro desconhecido',
              },
            },
            { onConflict: 'lead_id' }
          )
          .then(({ error }) => { if (error) console.warn('[enrich] upsert screenshot_failed:', error) })
      }

      // ── Stage: html ────────────────────────────────────────────────────────
      emitEnrichEvent(campaignId, {
        type: 'progress', current, total,
        lead_name: lead.company_name,
        stage: 'html',
      })

      let pageHtml: string | null = null
      try {
        const jinaRes = await fetch(`https://r.jina.ai/${normalizedUrl}`, {
          headers: { 'Accept': 'text/plain', 'X-No-Cache': 'true' },
          signal: AbortSignal.timeout(15_000),
        })
        if (jinaRes.ok) {
          const text = await jinaRes.text()
          pageHtml = text.slice(0, 15_000)
        }
      } catch {
        console.warn(`[enrich] Jina AI falhou para ${normalizedUrl} — continuando sem HTML`)
      }

      // ── Atualizar status no banco ──────────────────────────────────────────
      const { error: upsertError } = await supabase
        .from('lead_enrichment')
        .upsert(
          {
            lead_id:            lead.id,
            campaign_id:        campaignId,
            status:             'screenshot_done',
            normalized_website: normalizedUrl,
            page_html:          pageHtml,
            audit:              { screenshot_url: screenshotUrl },
          },
          { onConflict: 'lead_id' }
        )

      if (upsertError) throw new Error(`Supabase upsert falhou: ${upsertError.message}`)

      success++
    } catch (err) {
      console.error(`[enrich] Lead ${lead.id} (${lead.company_name}) falhou:`, err)
      failed++

      try {
        await supabase
          .from('lead_enrichment')
          .upsert(
            {
              lead_id:      lead.id,
              campaign_id:  campaignId,
              status:       'done',
              design_score: 0,
              tech_score:   0,
              audit: {
                website_status: 'failed',
                error: err instanceof Error ? err.message : 'Erro desconhecido',
              },
            },
            { onConflict: 'lead_id' }
          )
      } catch { /* ignore */ }
    }

    // delay entre leads (exceto o último)
    if (i < leads.length - 1) await delay(1000)
  }

  emitEnrichEvent(campaignId, { type: 'done', total, success, failed, unavailable })
}

// ─── route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let campaign_id: string
  try {
    const body = await req.json()
    if (!body?.campaign_id || typeof body.campaign_id !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'campaign_id ausente ou inválido' },
        { status: 400 }
      )
    }
    campaign_id = body.campaign_id
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // ── 2. Buscar leads pendentes ──────────────────────────────────────────────
  const { data: pendingLeads, error: fetchError } = await supabase
    .from('leads_to_enrich')
    .select('id, campaign_id, company_name, website')
    .eq('campaign_id', campaign_id)

  if (fetchError) {
    console.error('[enrich/start] Erro ao buscar leads:', fetchError)
    return NextResponse.json(
      { ok: false, error: `Erro ao buscar leads: ${fetchError.message}` },
      { status: 500 }
    )
  }

  if (!pendingLeads || pendingLeads.length === 0) {
    return NextResponse.json({
      ok: true, total: 0, no_site: 0, with_site: 0,
      message: 'Nenhum lead pendente de enriquecimento.',
    })
  }

  // ── 3. Separar sem site / com site ────────────────────────────────────────
  const noSite   = pendingLeads.filter((l) => !l.website || l.website.trim() === '')
  const withSite = pendingLeads.filter((l) =>  l.website && l.website.trim() !== '') as LeadToEnrich[]

  // ── 4. Etapa 1 — Upsert sem site → done ───────────────────────────────────
  if (noSite.length > 0) {
    const { error } = await supabase
      .from('lead_enrichment')
      .upsert(
        noSite.map((lead) => ({
          lead_id:      lead.id,
          campaign_id,
          status:       'done',
          design_score: 0,
          tech_score:   0,
          audit:        { website_status: 'no_site', note: 'Lead não possui website' },
        })),
        { onConflict: 'lead_id' }
      )

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao classificar leads sem site: ${error.message}` },
        { status: 500 }
      )
    }
  }

  // ── 5. Etapa 1 — Upsert com site → pending + normalized_website ───────────
  if (withSite.length > 0) {
    const { error } = await supabase
      .from('lead_enrichment')
      .upsert(
        withSite.map((lead) => ({
          lead_id:            lead.id,
          campaign_id,
          status:             'pending',
          normalized_website: normalizeUrl(lead.website!),
        })),
        { onConflict: 'lead_id' }
      )

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Erro ao preparar leads com site: ${error.message}` },
        { status: 500 }
      )
    }
  }

  // ── 6. Emitir evento de classificação concluída ────────────────────────────
  if (withSite.length > 0) {
    emitEnrichEvent(campaign_id, {
      type:     'classify',
      no_site:  noSite.length,
      with_site: withSite.length,
    })

    // ── 7. Fire-and-forget: screenshots ─────────────────────────────────────
    // Delay de 400ms para dar tempo ao cliente SSE de conectar antes dos primeiros eventos
    setTimeout(() => {
      processScreenshots(supabase, campaign_id, withSite).catch((err) => {
        console.error('[enrich/start] processScreenshots fatal:', err)
        emitEnrichEvent(campaign_id, {
          type: 'done', total: withSite.length, success: 0, failed: withSite.length, unavailable: 0,
        })
      })
    }, 400)
  }

  // ── 8. Retornar imediatamente ──────────────────────────────────────────────
  const parts: string[] = []
  if (noSite.length   > 0) parts.push(`${noSite.length} leads sem site classificados.`)
  if (withSite.length > 0) parts.push(`Capturando screenshots de ${withSite.length} leads…`)

  return NextResponse.json({
    ok:        true,
    total:     pendingLeads.length,
    no_site:   noSite.length,
    with_site: withSite.length,
    message:   parts.join(' ') || 'Concluído.',
  })
}
