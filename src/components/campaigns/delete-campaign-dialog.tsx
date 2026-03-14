'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Download, Loader2, Trash2 } from 'lucide-react'
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

interface DeleteCampaignDialogProps {
  campaign: Campaign | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted: (id: string) => void
}

export function DeleteCampaignDialog({
  campaign,
  open,
  onOpenChange,
  onDeleted,
}: DeleteCampaignDialogProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleBackup() {
    if (!campaign) return
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/campaigns/backup?campaign_id=${campaign.id}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error((data as { error?: string }).error ?? 'Erro ao gerar backup')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `backup_${campaign.name}_${format(new Date(), 'yyyy-MM-dd')}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Backup baixado com sucesso!')
    } catch {
      toast.error('Erro ao baixar backup')
    } finally {
      setIsDownloading(false)
    }
  }

  async function handleDelete() {
    if (!campaign) return
    setIsDeleting(true)
    try {
      const res = await fetch('/api/campaigns/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaign.id }),
      })
      const data: { ok: boolean; error?: string } = await res.json()

      if (!res.ok || !data.ok) {
        toast.error(data.error ?? `Erro ${res.status} ao deletar campanha`)
        return
      }

      toast.success(`Campanha "${campaign.name}" deletada.`)
      onDeleted(campaign.id)
      onOpenChange(false)
    } catch {
      toast.error('Erro de conexão ao deletar campanha')
    } finally {
      setIsDeleting(false)
    }
  }

  const isBusy = isDownloading || isDeleting

  return (
    <Dialog open={open} onOpenChange={(o) => !isBusy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">Deletar campanha</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja deletar a campanha{' '}
            <span className="font-semibold text-foreground">
              &quot;{campaign?.name}&quot;
            </span>
            ? Todos os leads e mensagens associados serão apagados permanentemente.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-400">
          Recomendamos baixar o backup antes de confirmar a exclusão.
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {/* Backup à esquerda */}
          <Button
            type="button"
            variant="outline"
            disabled={isBusy}
            onClick={handleBackup}
            className="gap-2"
          >
            {isDownloading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />}
            {isDownloading ? 'Baixando…' : 'Baixar backup (JSON)'}
          </Button>

          {/* Cancelar + Deletar à direita */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={isBusy}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isBusy}
              onClick={handleDelete}
              className="gap-2"
            >
              {isDeleting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />}
              {isDeleting ? 'Deletando…' : 'Deletar'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
