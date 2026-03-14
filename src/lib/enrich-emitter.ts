/**
 * Singleton EventEmitter para progresso de enriquecimento.
 *
 * Usa globalThis para sobreviver ao HMR do Next.js em dev.
 * O buffer por campaign_id evita race conditions entre o
 * POST fire-and-forget e a conexão SSE do cliente.
 */

import { EventEmitter } from 'events'

export interface EnrichClassifyEvent {
  type: 'classify'
  no_site: number
  with_site: number
}

export interface EnrichProgressEvent {
  type: 'progress'
  current: number
  total: number
  lead_name: string
  stage: 'screenshot' | 'upload' | 'html' | 'ai' | 'save'
}

export interface EnrichDoneEvent {
  type: 'done'
  total: number
  success: number
  failed: number
  unavailable: number
}

export type EnrichEvent = EnrichClassifyEvent | EnrichProgressEvent | EnrichDoneEvent

// ─── singleton ────────────────────────────────────────────────────────────────

const g = globalThis as typeof globalThis & {
  __enrichEmitter?: EventEmitter
  __enrichBuffer?: Map<string, EnrichEvent[]>
}

if (!g.__enrichEmitter) {
  g.__enrichEmitter = new EventEmitter()
  g.__enrichEmitter.setMaxListeners(50)
}

if (!g.__enrichBuffer) {
  g.__enrichBuffer = new Map()
}

export const enrichEmitter = g.__enrichEmitter
const enrichBuffer = g.__enrichBuffer

// ─── helpers ──────────────────────────────────────────────────────────────────

export function emitEnrichEvent(campaignId: string, event: EnrichEvent) {
  // buffer
  const buf = enrichBuffer.get(campaignId) ?? []
  buf.push(event)
  enrichBuffer.set(campaignId, buf)

  // live
  enrichEmitter.emit(campaignId, event)

  // clean buffer 30s after done
  if (event.type === 'done') {
    setTimeout(() => enrichBuffer.delete(campaignId), 30_000)
  }
}

export function clearEnrichBuffer(campaignId: string) {
  enrichBuffer.delete(campaignId)
}

export function getEnrichBuffer(campaignId: string): EnrichEvent[] {
  return enrichBuffer.get(campaignId) ?? []
}
