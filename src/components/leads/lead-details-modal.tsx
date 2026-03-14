'use client'

import { ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

import type { Lead } from '@/types/lead'
import type { Campaign } from '@/types/campaign'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { STATUS_CONFIG } from './leads-table'

interface LeadDetailsModalProps {
  lead: Lead | null
  campaign: Campaign | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children ?? '—'}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  )
}

export function LeadDetailsModal({
  lead,
  campaign,
  open,
  onOpenChange,
}: LeadDetailsModalProps) {
  if (!lead) return null

  const statusCfg = STATUS_CONFIG[lead.status] ?? {
    label: lead.status,
    className: '',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-6">
            <DialogTitle className="text-lg leading-tight">
              {lead.company_name}
            </DialogTitle>
            <Badge
              variant="secondary"
              className={statusCfg.className}
            >
              {statusCfg.label}
            </Badge>
          </div>
          <DialogDescription>
            {lead.category ?? 'Lead coletado'}
            {campaign ? ` · ${campaign.city}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* ── Contato ─────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Contato</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Telefone">{lead.phone ?? '—'}</Field>
              <Field label="Categoria">{lead.category ?? '—'}</Field>
              <Field label="Endereço">
                <span className="whitespace-normal leading-snug">
                  {lead.address ?? '—'}
                </span>
              </Field>
              <Field label="Website">
                {lead.website ? (
                  <a
                    href={lead.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Abrir site
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  '—'
                )}
              </Field>
            </div>
          </div>

          {/* ── Avaliações ──────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Avaliações</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Rating">
                {lead.rating != null ? `${lead.rating} ★` : '—'}
              </Field>
              <Field label="Avaliações">
                {lead.reviews_count != null
                  ? lead.reviews_count.toLocaleString('pt-BR')
                  : '—'}
              </Field>
            </div>
          </div>

          {/* ── Campanha ────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Campanha</SectionTitle>
            {campaign ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <Field label="Nome">{campaign.name}</Field>
                <Field label="Cidade">{campaign.city}</Field>
                <Field label="Nicho">{campaign.niche}</Field>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>

          {/* ── Meta ────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle>Meta</SectionTitle>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Field label="Origem">{lead.source ?? '—'}</Field>
              <Field label="Coletado em">
                {format(new Date(lead.created_at), "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                })}
              </Field>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
