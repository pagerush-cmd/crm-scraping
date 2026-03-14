'use client'

import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Search } from 'lucide-react'

import type { Lead } from '@/types/lead'
import type { Campaign } from '@/types/campaign'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { LeadDetailsModal } from './lead-details-modal'

// ─── status config (exportado para reutilizar no modal) ───────────────────────

export const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  new:       { label: 'Novo',        className: 'bg-blue-100 text-blue-700 border-transparent hover:bg-blue-100' },
  contacted: { label: 'Contatado',   className: 'bg-amber-100 text-amber-700 border-transparent hover:bg-amber-100' },
  replied:   { label: 'Respondeu',   className: 'bg-cyan-100 text-cyan-700 border-transparent hover:bg-cyan-100' },
  qualified: { label: 'Qualificado', className: 'bg-violet-100 text-violet-700 border-transparent hover:bg-violet-100' },
  converted: { label: 'Convertido',  className: 'bg-green-100 text-green-700 border-transparent hover:bg-green-100' },
  invalid:   { label: 'Inválido',    className: 'bg-red-100 text-red-700 border-transparent hover:bg-red-100' },
  lost:      { label: 'Perdido',     className: 'bg-gray-100 text-gray-600 border-transparent hover:bg-gray-100' },
}

// ─── props ────────────────────────────────────────────────────────────────────

interface LeadsTableProps {
  leads: Lead[]
  campaigns: Campaign[]
}

// ─── component ────────────────────────────────────────────────────────────────

export function LeadsTable({ leads, campaigns }: LeadsTableProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('all')

  // modal state — keep selectedLead alive during close animation
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const campaignMap = useMemo(
    () => new Map(campaigns.map((c) => [c.id, c])),
    [campaigns]
  )

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return leads.filter((lead) => {
      if (q) {
        const matchesName = lead.company_name.toLowerCase().includes(q)
        const matchesPhone = lead.phone?.toLowerCase().includes(q) ?? false
        if (!matchesName && !matchesPhone) return false
      }
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false
      if (campaignFilter !== 'all' && lead.campaign_id !== campaignFilter) return false
      return true
    })
  }, [leads, search, statusFilter, campaignFilter])

  function openLead(lead: Lead) {
    setSelectedLead(lead)
    setModalOpen(true)
  }

  // ── empty state (sem dados) ──────────────────────────────────────────────────
  if (leads.length === 0) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Nenhum lead ainda
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crie uma campanha e inicie a coleta para ver leads aqui.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="gap-4 pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold">
              Todos os Leads
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {filteredLeads.length === leads.length
                ? `${leads.length.toLocaleString('pt-BR')} leads`
                : `${filteredLeads.length.toLocaleString('pt-BR')} de ${leads.length.toLocaleString('pt-BR')} leads`}
            </span>
          </div>

          {/* ── Filtros ─────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa ou telefone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_CONFIG).map(([value, cfg]) => (
                  <SelectItem key={value} value={value}>
                    {cfg.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={campaignFilter} onValueChange={setCampaignFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Campanha" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as campanhas</SelectItem>
                {campaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredLeads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                Nenhum lead corresponde aos filtros
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tente ajustar a busca ou os filtros selecionados.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">Empresa</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="pr-6" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => {
                  const campaign = campaignMap.get(lead.campaign_id)
                  const statusCfg = STATUS_CONFIG[lead.status] ?? {
                    label: lead.status,
                    className: '',
                  }

                  return (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer"
                      onClick={() => openLead(lead)}
                    >
                      <TableCell className="pl-6 max-w-[200px]">
                        <span className="block truncate font-medium">
                          {lead.company_name}
                        </span>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {lead.phone ?? '—'}
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {lead.category ?? '—'}
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {lead.rating != null
                          ? `${lead.rating} ★${lead.reviews_count != null ? ` (${lead.reviews_count})` : ''}`
                          : '—'}
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {campaign?.city ?? '—'}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`rounded-lg text-xs ${statusCfg.className}`}
                        >
                          {statusCfg.label}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-muted-foreground">
                        {format(new Date(lead.created_at), 'dd/MM HH:mm', {
                          locale: ptBR,
                        })}
                      </TableCell>

                      <TableCell className="pr-6">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            openLead(lead)
                          }}
                        >
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Modal ─────────────────────────────────────────────────────────── */}
      <LeadDetailsModal
        lead={selectedLead}
        campaign={selectedLead ? campaignMap.get(selectedLead.campaign_id) : undefined}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  )
}
