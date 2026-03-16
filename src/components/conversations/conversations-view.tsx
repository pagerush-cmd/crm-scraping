'use client'

import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Send, MessageSquare, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { Lead } from '@/types/lead'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// ─── status config ────────────────────────────────────────────────────────────

const OUTREACH_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new:       { label: 'Novo',        className: 'bg-blue-100 text-blue-700 border-transparent' },
  contacted: { label: 'Contatado',   className: 'bg-amber-100 text-amber-700 border-transparent' },
  replied:   { label: 'Respondeu',   className: 'bg-cyan-100 text-cyan-700 border-transparent' },
  qualified: { label: 'Qualificado', className: 'bg-violet-100 text-violet-700 border-transparent' },
  converted: { label: 'Convertido',  className: 'bg-green-100 text-green-700 border-transparent' },
  invalid:   { label: 'Inválido',    className: 'bg-red-100 text-red-700 border-transparent' },
  lost:      { label: 'Perdido',     className: 'bg-gray-100 text-gray-600 border-transparent' },
}

// ─── types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  direction: string
  content: string
  created_at: string
  status: string
}

interface ConversationsViewProps {
  leads: Lead[]
}

// ─── component ────────────────────────────────────────────────────────────────

export function ConversationsView({ leads }: ConversationsViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(leads[0]?.id ?? null)
  const [messages,   setMessages]   = useState<Message[]>([])
  const [content,    setContent]    = useState('')
  const [sending,    setSending]    = useState(false)

  const feedRef     = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const selectedLead = leads.find((l) => l.id === selectedId) ?? null

  // Auto-scroll
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [messages])

  // Polling de mensagens
  useEffect(() => {
    if (!selectedId) return
    setMessages([])

    async function fetchMessages() {
      const res = await fetch(`/api/leads/${selectedId}/messages`)
      if (!res.ok) return
      const data: { messages?: Message[] } = await res.json()
      setMessages(data.messages ?? [])
    }

    fetchMessages()
    intervalRef.current = setInterval(fetchMessages, 2000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [selectedId])

  async function handleSend() {
    if (!selectedId || !content.trim() || sending) return
    const text = content.trim()
    setContent('')
    setSending(true)
    try {
      const res = await fetch(`/api/leads/${selectedId}/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content: text }),
      })
      const data: { ok?: boolean; error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao enviar')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      setContent(text)
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Painel esquerdo: lista de conversas ──────────────────────────────── */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card overflow-hidden">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Conversas</span>
          <span className="ml-auto text-xs text-muted-foreground">{leads.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {leads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-2">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">Nenhuma conversa ainda.<br />Inicie um disparo para ver leads aqui.</p>
            </div>
          ) : (
            leads.map((lead) => {
              const cfg = OUTREACH_STATUS_CONFIG[lead.outreach_status ?? '']
              return (
                <button
                  key={lead.id}
                  onClick={() => setSelectedId(lead.id)}
                  className={cn(
                    'w-full flex flex-col gap-1 px-4 py-3 text-left border-b border-border/50 transition-colors hover:bg-accent',
                    selectedId === lead.id && 'bg-accent'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground leading-snug line-clamp-2">
                      {lead.company_name}
                    </span>
                    {cfg && (
                      <Badge variant="secondary" className={cn('shrink-0 text-[10px] px-1.5 py-0', cfg.className)}>
                        {cfg.label}
                      </Badge>
                    )}
                  </div>
                  {lead.category && (
                    <span className="text-[11px] text-muted-foreground truncate">{lead.category}</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* ── Painel direito: chat ─────────────────────────────────────────────── */}
      {!selectedLead ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <p className="text-sm">Selecione uma conversa</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* header */}
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {selectedLead.company_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{selectedLead.company_name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{selectedLead.phone ?? '—'}</p>
            </div>
            {selectedLead.outreach_status && OUTREACH_STATUS_CONFIG[selectedLead.outreach_status] && (
              <Badge
                variant="secondary"
                className={cn('ml-auto shrink-0', OUTREACH_STATUS_CONFIG[selectedLead.outreach_status].className)}
              >
                {OUTREACH_STATUS_CONFIG[selectedLead.outreach_status].label}
              </Badge>
            )}
          </div>

          {/* feed de mensagens */}
          <div
            ref={feedRef}
            className="flex flex-1 flex-col gap-2 overflow-y-auto p-4"
          >
            {messages.length === 0 ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-xs text-muted-foreground">Nenhuma mensagem ainda.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={cn('flex', msg.direction === 'inbound' ? 'justify-end' : 'justify-start')}>
                  <div className={cn(
                    'max-w-[72%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                    msg.direction === 'outbound'
                      ? 'rounded-tl-sm border bg-card text-foreground'
                      : 'rounded-tr-sm bg-primary text-primary-foreground'
                  )}>
                    {msg.direction === 'outbound' && (
                      <p className="mb-0.5 text-[10px] font-semibold text-muted-foreground">Ana</p>
                    )}
                    <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                    <p className={cn(
                      'mt-1 text-[10px]',
                      msg.direction === 'outbound' ? 'text-muted-foreground' : 'text-primary-foreground/70'
                    )}>
                      {format(new Date(msg.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* input de envio manual */}
          <div className="flex shrink-0 gap-2 border-t border-border p-3">
            <Input
              ref={inputRef}
              placeholder="Enviar mensagem manual…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              disabled={sending}
              className="text-sm"
            />
            <Button size="sm" onClick={handleSend} disabled={sending || !content.trim()} className="shrink-0">
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
