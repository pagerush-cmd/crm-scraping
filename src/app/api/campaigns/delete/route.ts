import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 })
  }

  const { id } = body
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ ok: false, error: 'id obrigatório' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // ── 1. Buscar leads da campanha ──────────────────────────────────────────────
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id')
    .eq('campaign_id', id)

  if (leadsErr) {
    return NextResponse.json({ ok: false, error: leadsErr.message }, { status: 500 })
  }

  const leadIds = (leads ?? []).map((l) => l.id)

  if (leadIds.length > 0) {
    // ── 2. Deletar messages dos leads ──────────────────────────────────────────
    const { error: msgErr } = await supabase
      .from('messages')
      .delete()
      .in('lead_id', leadIds)

    if (msgErr) {
      console.error('[campaigns/delete] messages:', msgErr.message)
      return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 })
    }

    // ── 3. Deletar lead_enrichment dos leads ───────────────────────────────────
    const { error: enrichErr } = await supabase
      .from('lead_enrichment')
      .delete()
      .in('lead_id', leadIds)

    if (enrichErr) {
      console.error('[campaigns/delete] lead_enrichment:', enrichErr.message)
      // não fatal — continua
    }
  }

  // ── 4. Deletar leads ─────────────────────────────────────────────────────────
  const { error: delLeadsErr } = await supabase
    .from('leads')
    .delete()
    .eq('campaign_id', id)

  if (delLeadsErr) {
    console.error('[campaigns/delete] leads:', delLeadsErr.message)
    return NextResponse.json({ ok: false, error: delLeadsErr.message }, { status: 500 })
  }

  // ── 5. Deletar campanha ──────────────────────────────────────────────────────
  const { error: delCampaignErr } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id)

  if (delCampaignErr) {
    console.error('[campaigns/delete] campaign:', delCampaignErr.message)
    return NextResponse.json({ ok: false, error: delCampaignErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
