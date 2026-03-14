import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabaseServer'

function toSafeFilename(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
}

export async function GET(req: NextRequest) {
  const campaignId = req.nextUrl.searchParams.get('campaign_id')

  if (!campaignId) {
    return NextResponse.json({ ok: false, error: 'campaign_id obrigatório' }, { status: 400 })
  }

  const supabase = createServerClient()

  // ── 1. Buscar campanha ───────────────────────────────────────────────────────
  const { data: campaign, error: campaignErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignErr || !campaign) {
    return NextResponse.json({ ok: false, error: 'Campanha não encontrada' }, { status: 404 })
  }

  // ── 2. Buscar leads ──────────────────────────────────────────────────────────
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })

  if (leadsErr) {
    return NextResponse.json({ ok: false, error: leadsErr.message }, { status: 500 })
  }

  // ── 3. Buscar messages ───────────────────────────────────────────────────────
  const leadIds = (leads ?? []).map((l) => l.id)
  let messages: unknown[] = []

  if (leadIds.length > 0) {
    const { data: msgs, error: msgsErr } = await supabase
      .from('messages')
      .select('*')
      .in('lead_id', leadIds)
      .order('created_at', { ascending: true })

    if (msgsErr) {
      console.error('[campaigns/backup] messages:', msgsErr)
    } else {
      messages = msgs ?? []
    }
  }

  // ── 4. Montar e retornar o JSON ──────────────────────────────────────────────
  const backup = {
    exported_at: new Date().toISOString(),
    campaign,
    leads: leads ?? [],
    messages,
  }

  const date = new Date().toISOString().split('T')[0]
  const safeName = toSafeFilename(campaign.name)
  const filename = `backup_${safeName}_${date}.json`

  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
