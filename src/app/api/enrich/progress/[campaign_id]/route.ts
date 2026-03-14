import { NextRequest } from 'next/server'
import { enrichEmitter, getEnrichBuffer } from '@/lib/enrich-emitter'
import type { EnrichEvent } from '@/lib/enrich-emitter'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaign_id: string }> }
) {
  const { campaign_id } = await params

  const stream = new ReadableStream({
    start(controller) {
      function send(event: EnrichEvent) {
        try {
          controller.enqueue(`data: ${JSON.stringify(event)}\n\n`)
        } catch {
          // controller already closed
        }
      }

      function close() {
        enrichEmitter.off(campaign_id, onEvent)
        try { controller.close() } catch { /* already closed */ }
      }

      function onEvent(event: EnrichEvent) {
        send(event)
        if (event.type === 'done') close()
      }

      // Replay buffered events first (handles race condition)
      const buffer = getEnrichBuffer(campaign_id)
      for (const event of buffer) {
        send(event)
        if (event.type === 'done') {
          // Already finished — close immediately, no need to listen
          try { controller.close() } catch { /* ignore */ }
          return
        }
      }

      // Subscribe for future events
      enrichEmitter.on(campaign_id, onEvent)

      // Clean up on client disconnect
      req.signal.addEventListener('abort', () => {
        enrichEmitter.off(campaign_id, onEvent)
        try { controller.close() } catch { /* ignore */ }
      })
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
