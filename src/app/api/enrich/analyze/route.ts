import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { emitEnrichEvent, clearEnrichBuffer } from '@/lib/enrich-emitter'

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// ─── tipos ────────────────────────────────────────────────────────────────────

interface LeadToAnalyze {
  lead_id:            string
  campaign_id:        string
  company_name:       string
  normalized_website: string | null
  page_html:          string | null
  audit:              { screenshot_url?: string; website_status?: string } | null
}

interface ClaudeAnalysis {
  design_score:     number   // 0-10
  tech_score:       number   // 0-10
  design_label:     string   // "fraco" | "medio" | "forte"
  weak_points:      string[] // 5 pontos fracos
  quick_wins:       string[] // 3 melhorias rápidas
  outreach_message: string   // mensagem WhatsApp pronta
  notes:            string   // observação geral 1-2 frases
}

// ─── prompt ───────────────────────────────────────────────────────────────────

function buildPrompt(htmlContent: string | null): string {
  const htmlSection = htmlContent
    ? `Conteúdo do site:\n<html_content>\n${htmlContent}\n</html_content>\n\n`
    : ''

  return `Você é um consultor de marketing digital especializado em análise de sites para pequenas e médias empresas locais brasileiras.

Analise o screenshot E o conteúdo textual deste site empresarial legítimo.

${htmlSection}Retorne APENAS um JSON puro, sem explicações, sem markdown, sem blocos de código:

{
  "design_score": <0 a 10 baseado no screenshot>,
  "design_label": "fraco" ou "medio" ou "forte",
  "tech_score": <0 a 10 baseado no conteúdo: SEO, copy, CTAs, estrutura>,
  "weak_points": ["<ponto fraco 1>", "<ponto fraco 2>", "<ponto fraco 3>", "<ponto fraco 4>", "<ponto fraco 5>"],
  "quick_wins": ["<melhoria rápida 1>", "<melhoria rápida 2>", "<melhoria rápida 3>"],
  "outreach_message": "<mensagem WhatsApp persuasiva de até 120 palavras em português apontando problemas específicos do site>",
  "notes": "<observação geral em 1-2 frases>"
}`
}

// ─── Claude analysis ──────────────────────────────────────────────────────────

async function analyzeWithClaude(
  imageBase64: string,
  websiteUrl:  string,
  pageHtml:    string | null,
): Promise<ClaudeAnalysis> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const prompt = buildPrompt(pageHtml)

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
          },
          {
            type: 'text',
            text: `Site: ${websiteUrl}\n\n${prompt}`,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  const json = text.startsWith('```')
    ? text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
    : text

  return JSON.parse(json) as ClaudeAnalysis
}

// ─── loop de análise (fire-and-forget) ────────────────────────────────────────

async function processAnalysis(
  supabase: ReturnType<typeof createServiceClient>,
  campaignId: string,
  leads: LeadToAnalyze[],
) {
  const total   = leads.length
  let   success = 0
  let   failed  = 0

  for (let i = 0; i < leads.length; i++) {
    const lead    = leads[i]
    const current = i + 1

    const screenshotUrl = lead.audit?.screenshot_url
    if (!screenshotUrl) {
      console.warn(`[analyze] Lead ${lead.lead_id} sem screenshot_url no audit — pulando`)
      failed++
      continue
    }

    try {
      // ── Stage: ai ──────────────────────────────────────────────────────
      emitEnrichEvent(campaignId, {
        type:      'progress', current, total,
        lead_name: lead.company_name,
        stage:     'ai',
      })

      // Baixar e redimensionar imagem (above-the-fold: 1280×2000 máx)
      const imgRes = await fetch(screenshotUrl, { signal: AbortSignal.timeout(30_000) })
      if (!imgRes.ok) throw new Error(`Falha ao baixar screenshot (HTTP ${imgRes.status})`)
      const imgRaw = Buffer.from(await imgRes.arrayBuffer())

      const imgBytes = await sharp(imgRaw)
        .resize({ width: 1280, height: 2000, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer()

      const imgBase64 = imgBytes.toString('base64')

      const analysis = await analyzeWithClaude(
        imgBase64,
        lead.normalized_website ?? screenshotUrl,
        lead.page_html,
      )

      // ── Stage: save ─────────────────────────────────────────────────────
      emitEnrichEvent(campaignId, {
        type:      'progress', current, total,
        lead_name: lead.company_name,
        stage:     'save',
      })

      const { error: upsertError } = await supabase
        .from('lead_enrichment')
        .upsert(
          {
            lead_id:          lead.lead_id,
            campaign_id:      campaignId,
            status:           'done',
            screenshot_url:   screenshotUrl,
            design_score:     analysis.design_score,
            tech_score:       analysis.tech_score,
            design_label:     analysis.design_label,
            outreach_message: analysis.outreach_message,
            audit: {
              screenshot_url: screenshotUrl,
              website_status: 'ok',
              weak_points:    analysis.weak_points,
              quick_wins:     analysis.quick_wins,
              notes:          analysis.notes,
            },
          },
          { onConflict: 'lead_id' }
        )

      if (upsertError) throw new Error(`Upsert falhou: ${upsertError.message}`)

      success++
    } catch (err) {
      console.error(`[analyze] Lead ${lead.lead_id} (${lead.company_name}) falhou:`, err)
      failed++
      // Mantém status 'screenshot_done' para permitir retry
    }

    if (i < leads.length - 1) await delay(500)
  }

  emitEnrichEvent(campaignId, {
    type: 'done', total, success, failed, unavailable: 0,
  })
}

// ─── route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
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

  // Buscar leads com screenshot pronto aguardando análise
  const { data: leads, error: fetchError } = await supabase
    .from('lead_enrichment')
    .select('lead_id, campaign_id, normalized_website, page_html, audit')
    .eq('campaign_id', campaign_id)
    .eq('status', 'screenshot_done')

  if (fetchError) {
    return NextResponse.json(
      { ok: false, error: `Erro ao buscar leads: ${fetchError.message}` },
      { status: 500 }
    )
  }

  // Buscar company_name dos leads
  const leadIds = (leads ?? []).map((l) => l.lead_id)
  const { data: leadNames } = await supabase
    .from('leads')
    .select('id, company_name')
    .in('id', leadIds)

  const nameMap = new Map((leadNames ?? []).map((l) => [l.id, l.company_name]))

  const leadsToAnalyze: LeadToAnalyze[] = (leads ?? []).map((l) => ({
    lead_id:            l.lead_id,
    campaign_id:        l.campaign_id,
    company_name:       nameMap.get(l.lead_id) ?? l.lead_id,
    normalized_website: l.normalized_website,
    page_html:          (l.page_html as string | null) ?? null,
    audit:              l.audit as LeadToAnalyze['audit'],
  }))

  if (leadsToAnalyze.length === 0) {
    return NextResponse.json({
      ok: true, total: 0,
      message: 'Nenhum lead com screenshot aguardando análise.',
    })
  }

  // Limpar buffer do SSE anterior para evitar replay do 'done' do start
  clearEnrichBuffer(campaign_id)

  // Fire-and-forget com delay para o cliente SSE reconectar
  setTimeout(() => {
    processAnalysis(supabase, campaign_id, leadsToAnalyze).catch((err) => {
      console.error('[analyze] processAnalysis fatal:', err)
      emitEnrichEvent(campaign_id, {
        type: 'done', total: leadsToAnalyze.length, success: 0,
        failed: leadsToAnalyze.length, unavailable: 0,
      })
    })
  }, 400)

  return NextResponse.json({
    ok:      true,
    total:   leadsToAnalyze.length,
    message: `Analisando ${leadsToAnalyze.length} site(s) com IA…`,
  })
}
