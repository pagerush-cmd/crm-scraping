'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { Campaign } from '@/types/campaign'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface EnrichLeadsDialogProps {
  campaign: Campaign | null
  open: boolean
  onOpenChange: (open: boolean) => void
  pendingLeads?: number
  onSuccess?: (result: { withSite: number }) => void
}

export function EnrichLeadsDialog({
  campaign,
  open,
  onOpenChange,
  pendingLeads,
  onSuccess,
}: EnrichLeadsDialogProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleEnrich() {
    if (!campaign) return
    setIsLoading(true)
    try {
      const res = await fetch('/api/enrich/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaign.id }),
      })

      const data: {
        ok: boolean
        message?: string
        total?: number
        no_site?: number
        with_site?: number
        error?: string
      } = await res.json()

      if (!data.ok) {
        toast.error(data.error ?? 'Erro ao iniciar enriquecimento')
        return
      }

      toast.success(data.message ?? `Enriquecimento iniciado para "${campaign.name}"`)
      onOpenChange(false)
      onSuccess?.({ withSite: data.with_site ?? 0 })
    } catch {
      toast.error('Erro de conexão — verifique se o servidor está rodando')
    } finally {
      setIsLoading(false)
    }
  }

  const pendingSuffix =
    pendingLeads != null
      ? ` (${pendingLeads.toLocaleString('pt-BR')} leads pendentes)`
      : ''

  return (
    <Dialog open={open} onOpenChange={(o) => !isLoading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Iniciar enriquecimento</DialogTitle>
          <DialogDescription>
            Deseja iniciar o enriquecimento de todos os leads pendentes da campanha{' '}
            <span className="font-semibold text-foreground">
              &quot;{campaign?.name}&quot;
            </span>
            {pendingSuffix}?
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isLoading}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={isLoading}
            onClick={handleEnrich}
            className="gap-2"
          >
            {isLoading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Sparkles className="h-4 w-4" />}
            {isLoading ? 'Iniciando…' : 'Iniciar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
