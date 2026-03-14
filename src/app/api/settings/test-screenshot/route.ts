import { NextResponse } from 'next/server'
import { takeScreenshot } from '@/lib/screenshot'

export async function GET() {
  try {
    const imageBytes = await takeScreenshot('https://www.google.com')
    return new NextResponse(imageBytes, {
      headers: { 'Content-Type': 'image/jpeg' },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro desconhecido' },
      { status: 500 }
    )
  }
}
