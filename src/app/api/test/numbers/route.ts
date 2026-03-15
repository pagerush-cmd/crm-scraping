import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// GET /api/test/numbers
export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('test_numbers')
    .select('id, name, phone, active')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ numbers: data })
}

// POST /api/test/numbers
export async function POST(req: NextRequest) {
  const { name, phone }: { name?: string; phone?: string } = await req.json()
  if (!name || !phone) return NextResponse.json({ error: 'name e phone obrigatórios' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('test_numbers')
    .insert({ name, phone, active: true })
    .select('id, name, phone, active')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ number: data })
}
