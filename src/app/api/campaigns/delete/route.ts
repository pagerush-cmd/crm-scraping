import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'

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

  const supabase = createServerClient()

  // ── 1. Buscar leads da campanha ──────────────────────────────────────────────
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id')
    .eq('campaign_id', id)

  if (leadsErr) {
    return NextResponse.json({ ok: false, error: leadsErr.message }, { status: 500 })
  }

  const leadIds = (leads ?? []).map((l) => l.id)

  // ── 2. Deletar messages dos leads ────────────────────────────────────────────
  if (leadIds.length > 0) {
    const { error: msgErr } = await supabase
      .from('messages')
      .delete()
      .in('lead_id', leadIds)

    if (msgErr) {
      console.error('[campaigns/delete] messages:', msgErr)
      return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 })
    }
  }

  // ── 3. Deletar leads ─────────────────────────────────────────────────────────
  const { error: delLeadsErr } = await supabase
    .from('leads')
    .delete()
    .eq('campaign_id', id)

  if (delLeadsErr) {
    console.error('[campaigns/delete] leads:', delLeadsErr)
    return NextResponse.json({ ok: false, error: delLeadsErr.message }, { status: 500 })
  }

  // ── 4. Deletar campanha ──────────────────────────────────────────────────────
  const { error: delCampaignErr } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id)

  if (delCampaignErr) {
    console.error('[campaigns/delete] campaign:', delCampaignErr)
    return NextResponse.json({ ok: false, error: delCampaignErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
