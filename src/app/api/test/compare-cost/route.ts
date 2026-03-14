import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const PROMPT = `Analise este screenshot de site empresarial brasileiro e retorne APENAS um JSON:
{
  "design_score": (0 a 10),
  "design_label": "fraco" ou "medio" ou "forte",
  "notes": "observação em 1 frase"
}`

// claude-sonnet-4-6 pricing (USD per token)
const PRICE_INPUT  = 3.00  / 1_000_000   // $3.00 / 1M input tokens
const PRICE_OUTPUT = 15.00 / 1_000_000   // $15.00 / 1M output tokens

function calcCost(input: number, output: number) {
  return input * PRICE_INPUT + output * PRICE_OUTPUT
}

interface AnalysisResult {
  input_tokens:  number
  output_tokens: number
  total_tokens:  number
  cost_usd:      number
  time_ms:       number
  result:        unknown
}

export async function POST(req: NextRequest) {
  let lead_id: string
  try {
    const body = await req.json()
    if (!body?.lead_id || typeof body.lead_id !== 'string') {
      return NextResponse.json({ ok: false, error: 'lead_id obrigatório' }, { status: 400 })
    }
    lead_id = body.lead_id
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 })
  }

  // Buscar screenshot_url
  const supabase = createServiceClient()
  const { data: enrichment, error } = await supabase
    .from('lead_enrichment')
    .select('screenshot_url')
    .eq('lead_id', lead_id)
    .single()

  if (error || !enrichment) {
    return NextResponse.json({ ok: false, error: 'Lead não encontrado' }, { status: 404 })
  }
  if (!enrichment.screenshot_url) {
    return NextResponse.json({ ok: false, error: 'screenshot_url não preenchido para este lead' }, { status: 422 })
  }

  const screenshotUrl = enrichment.screenshot_url as string
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  // ── Abordagem A: URL direta ──────────────────────────────────────────────────
  const urlResult = await (async (): Promise<AnalysisResult> => {
    const t0 = Date.now()
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: screenshotUrl },
          },
          { type: 'text', text: PROMPT },
        ],
      }],
    })
    const time_ms = Date.now() - t0

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const json = text.startsWith('```')
      ? text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
      : text

    let result: unknown
    try { result = JSON.parse(json) } catch { result = text }

    return {
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      total_tokens:  response.usage.input_tokens + response.usage.output_tokens,
      cost_usd:      calcCost(response.usage.input_tokens, response.usage.output_tokens),
      time_ms,
      result,
    }
  })()

  // ── Abordagem B: Base64 ──────────────────────────────────────────────────────
  const base64Result = await (async (): Promise<AnalysisResult> => {
    const t0 = Date.now()

    const imgRes = await fetch(screenshotUrl, { signal: AbortSignal.timeout(30_000) })
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem (HTTP ${imgRes.status})`)
    const imgBuffer  = Buffer.from(await imgRes.arrayBuffer())
    const imgBase64  = imgBuffer.toString('base64')
    const fetchMs    = Date.now() - t0

    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imgBase64 },
          },
          { type: 'text', text: PROMPT },
        ],
      }],
    })
    const time_ms = Date.now() - t0

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    const json = text.startsWith('```')
      ? text.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim()
      : text

    let result: unknown
    try { result = JSON.parse(json) } catch { result = text }

    return {
      input_tokens:  response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      total_tokens:  response.usage.input_tokens + response.usage.output_tokens,
      cost_usd:      calcCost(response.usage.input_tokens, response.usage.output_tokens),
      time_ms,
      fetch_ms:      fetchMs,
      result,
    }
  })()

  const tokenDiff = urlResult.total_tokens - base64Result.total_tokens
  const costDiff  = urlResult.cost_usd - base64Result.cost_usd
  const winner    = tokenDiff <= 0 ? 'url' : 'base64'

  return NextResponse.json({
    ok:                   true,
    lead_id,
    url:                  urlResult,
    base64:               base64Result,
    winner,
    token_difference:     Math.abs(tokenDiff),
    cost_difference_usd:  Math.abs(costDiff),
  })
}
