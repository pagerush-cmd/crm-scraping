'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronDown, Loader2, MessageSquare, Send, UserCheck } from 'lucide-react'
import { toast } from 'sonner'

import type { Campaign } from '@/types/campaign'
import { supabase } from '@/lib/supabase'
import { STATUS_CONFIG, TAB_FILTERS, type LeadStatus } from '@/lib/outreach-config'
import { cn } from '@/lib/utils'
import { Badge }   from '@/components/ui/badge'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface PipelineLead {
  id:           string
  company_name: string
  phone:        string | null
  website:      string | null
  status:       string
  created_at:   string
}

// NOTE: Adjust column names to match your actual 'messages' table schema.
// Expected: id, lead_id, content (text), direction ('inbound'|'outbound'), created_at
interface Message {
  id:         string
  lead_id:    string
  content:    string
  direction:  'inbound' | 'outbound'
  created_at: string
}

interface Enrichment {
  design_score:     number | null
  design_label:     string | null
  tech_score:       number | null
  outreach_message: string | null
  audit: {
    weak_points?: string[]
    quick_wins?:  string[]
    notes?:       string
  } | null
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatMsgTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ─── component ────────────────────────────────────────────────────────────────

interface OutreachPipelineProps {
  campaign: Campaign
  leads:    PipelineLead[]
}

export function OutreachPipeline({ campaign, leads: initialLeads }: OutreachPipelineProps) {
  const [leads, setLeads]           = useState<PipelineLead[]>(initialLeads)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [activeTab, setActiveTab]   = useState<LeadStatus | 'all'>('all')

  const [messages, setMessages]       = useState<Message[]>([])
  const [enrichment, setEnrichment]   = useState<Enrichment | null>(null)
  const [lastMsgs, setLastMsgs]       = useState<Map<string, Message>>(new Map())
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [showEnrich, setShowEnrich]   = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Fetch last message per lead for preview
  useEffect(() => {
    if (leads.length === 0) return
    const ids = leads.map((l) => l.id)
    supabase
      .from('messages')
      .select('id, lead_id, content, direction, created_at')
      .in('lead_id', ids)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        const map = new Map<string, Message>()
        for (const msg of data as Message[]) {
          if (!map.has(msg.lead_id)) map.set(msg.lead_id, msg)
        }
        setLastMsgs(map)
      })
  }, [leads])

  // Fetch conversation when lead selected
  const fetchMessages = useCallback(async (leadId: string) => {
    setLoadingMsgs(true)
    setMessages([])
    const { data } = await supabase
      .from('messages')
      .select('id, lead_id, content, direction, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: true })
    setMessages((data ?? []) as Message[])
    setLoadingMsgs(false)
  }, [])

  const fetchEnrichment = useCallback(async (leadId: string) => {
    const { data } = await supabase
      .from('lead_enrichment')
      .select('design_score, design_label, tech_score, outreach_message, audit')
      .eq('lead_id', leadId)
      .single()
    setEnrichment((data as Enrichment | null) ?? null)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    setShowEnrich(false)
    fetchMessages(selectedId)
    fetchEnrichment(selectedId)
  }, [selectedId, fetchMessages, fetchEnrichment])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleStatusChange(leadId: string, newStatus: string) {
    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', leadId)
    if (error) {
      toast.error('Erro ao atualizar status')
      return
    }
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, status: newStatus } : l))
  }

  const selectedLead = leads.find((l) => l.id === selectedId) ?? null

  const filteredLeads = leads.filter((l) => {
    const q = search.toLowerCase()
    const matchSearch = !q || l.company_name.toLowerCase().includes(q) || (l.phone ?? '').includes(q)
    const matchTab    = activeTab === 'all' || l.status === activeTab
    return matchSearch && matchTab
  })

  const tabCounts = Object.fromEntries(
    TAB_FILTERS.map((t) => [
      t.key,
      t.key === 'all' ? leads.length : leads.filter((l) => l.status === t.key).length,
    ])
  ) as Record<LeadStatus | 'all', number>

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Coluna esquerda ─────────────────────────────────────────────────── */}
      <aside className="flex w-[380px] shrink-0 flex-col border-r overflow-hidden bg-card">

        {/* Top bar */}
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
            <Link href="/outreach">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{campaign.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">{campaign.city} · {campaign.niche}</p>
          </div>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b p-2.5">
          <Input
            placeholder="Buscar empresa ou telefone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex gap-1 overflow-x-auto border-b px-2 py-1.5 scrollbar-none">
          {TAB_FILTERS.map((tab) => {
            const count = tabCounts[tab.key]
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors',
                  activeTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span className={cn(
                    'rounded-full px-1 text-[9px] font-bold',
                    activeTab === tab.key ? 'bg-white/20' : 'bg-muted'
                  )}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Lead list */}
        <div className="flex-1 overflow-y-auto divide-y">
          {filteredLeads.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <p className="text-sm text-muted-foreground">Nenhum lead encontrado</p>
            </div>
          )}
          {filteredLeads.map((lead) => {
            const cfg      = STATUS_CONFIG[lead.status as LeadStatus]
            const lastMsg  = lastMsgs.get(lead.id)
            const selected = lead.id === selectedId
            const isHuman  = lead.status === 'waiting_human'

            return (
              <button
                key={lead.id}
                onClick={() => setSelectedId(lead.id)}
                className={cn(
                  'w-full text-left px-4 py-3 transition-colors hover:bg-accent',
                  selected && 'bg-accent'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {isHuman && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 animate-pulse" />
                    )}
                    <span className="truncate text-sm font-medium text-foreground">
                      {lead.company_name}
                    </span>
                  </div>
                  {lastMsg && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatMsgTime(lastMsg.created_at)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-muted-foreground">
                    {lastMsg ? lastMsg.content.slice(0, 40) : '—'}
                  </p>
                  {cfg && (
                    <Badge
                      variant="secondary"
                      className={`shrink-0 rounded-md px-1.5 py-0 text-[10px] border-transparent ${cfg.bg} ${cfg.text}`}
                    >
                      {cfg.label}
                    </Badge>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* ── Coluna direita ──────────────────────────────────────────────────── */}
      <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
        {!selectedLead ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/20" />
            <div>
              <p className="text-sm font-medium text-foreground">Selecione um lead para ver a conversa</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''} nesta visualização
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between gap-3 border-b px-4 py-3 bg-card">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {selectedLead.status === 'waiting_human' && (
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 animate-pulse" />
                  )}
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {selectedLead.company_name}
                  </h2>
                </div>
                {selectedLead.phone && (
                  <p className="text-xs text-muted-foreground">{selectedLead.phone}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {selectedLead.status === 'waiting_human' && (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => handleStatusChange(selectedLead.id, 'responding')}
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    Assumir conversa
                  </Button>
                )}

                <Select
                  value={selectedLead.status}
                  onValueChange={(v) => handleStatusChange(selectedLead.id, v)}
                >
                  <SelectTrigger className="h-7 w-[170px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {cfg.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2">
              {loadingMsgs ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn('flex', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[72%] rounded-2xl px-3.5 py-2.5 text-sm',
                        msg.direction === 'outbound'
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-muted text-foreground rounded-bl-sm'
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                      <p className={cn(
                        'mt-1 text-right text-[10px]',
                        msg.direction === 'outbound' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                      )}>
                        {formatMsgTime(msg.created_at)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 flex gap-2 border-t px-3 py-2.5 bg-card">
              <Input
                placeholder="Mensagem manual (em breve)…"
                disabled
                className="flex-1 text-sm"
              />
              <Button size="sm" disabled className="gap-1.5 px-3">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Enrichment panel */}
            <div className="shrink-0 border-t bg-card">
              <button
                onClick={() => setShowEnrich((p) => !p)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent"
              >
                Dados do site
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showEnrich && 'rotate-180')} />
              </button>

              {showEnrich && (
                <div className="max-h-52 overflow-y-auto border-t px-4 py-3 flex flex-col gap-3">
                  {!enrichment ? (
                    <p className="text-xs text-muted-foreground">Sem dados de enriquecimento.</p>
                  ) : (
                    <>
                      {/* Scores */}
                      <div className="flex gap-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-muted-foreground">Design</span>
                          <span className="text-sm font-bold">{enrichment.design_score ?? '—'}/10</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-muted-foreground">Label</span>
                          <span className="text-sm font-medium capitalize">{enrichment.design_label ?? '—'}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-muted-foreground">Técnico</span>
                          <span className="text-sm font-bold">{enrichment.tech_score ?? '—'}/10</span>
                        </div>
                      </div>

                      {/* Weak points */}
                      {(enrichment.audit?.weak_points ?? []).length > 0 && (
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Pontos fracos
                          </p>
                          <ul className="flex flex-col gap-0.5">
                            {enrichment.audit!.weak_points!.map((pt, i) => (
                              <li key={i} className="text-xs text-foreground">• {pt}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Outreach message */}
                      {enrichment.outreach_message && (
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Mensagem de abordagem
                          </p>
                          <p className="rounded-xl bg-muted/60 p-2.5 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                            {enrichment.outreach_message}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
