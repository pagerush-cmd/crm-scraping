import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET /api/test/messages?phone=NUMERO
export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get('phone')
  if (!phone) return NextResponse.json({ error: 'phone obrigatório' }, { status: 400 })

  const phone11 = phone.replace(/\D/g, '').slice(-11)

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('test_messages')
    .select('id, phone, direction, content, created_at')
    .eq('phone', phone11)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data })
}
