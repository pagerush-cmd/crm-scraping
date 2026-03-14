'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
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
import { Form } from '@/components/ui/form'
import {
  CampaignFormFields,
  campaignFormSchema,
  parseCityString,
  toSlug,
  type CampaignFormValues,
} from './campaign-form-fields'

interface EditCampaignModalProps {
  campaign: Campaign | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: (campaign: Campaign) => void
}

export function EditCampaignModal({
  campaign,
  open,
  onOpenChange,
  onUpdated,
}: EditCampaignModalProps) {
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: { name: '', uf: '', city: '', niche: '', daily_limit: 20 },
  })

  // Preencher form com os dados da campanha ao abrir
  useEffect(() => {
    if (!open || !campaign) return

    const { city, uf } = parseCityString(campaign.city)

    form.reset({
      name:        campaign.name,
      uf,
      city,
      niche:       campaign.niche,
      daily_limit: campaign.daily_limit,
    })
  }, [open, campaign, form])

  async function onSubmit(values: CampaignFormValues) {
    if (!campaign) return

    const cityFormatted = `${values.city} - ${values.uf}`
    const name =
      values.name.trim() ||
      `${toSlug(values.niche)}_${toSlug(values.city)}_${values.uf.toLowerCase()}`

    try {
      const res = await fetch('/api/campaigns/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:          campaign.id,
          name,
          city:        cityFormatted,
          niche:       values.niche,
          daily_limit: values.daily_limit,
        }),
      })
      const data: { ok: boolean; campaign?: Campaign; error?: string } = await res.json()

      if (!res.ok || !data.ok || !data.campaign) {
        toast.error(data.error ?? `Erro ${res.status} ao salvar campanha`)
        return
      }

      toast.success(`Campanha "${data.campaign.name}" atualizada!`)
      onUpdated(data.campaign)
      onOpenChange(false)
    } catch {
      toast.error('Erro de conexão ao salvar campanha')
    }
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar campanha</DialogTitle>
          <DialogDescription>
            Atualize os dados da campanha{campaign ? ` "${campaign.name}"` : ''}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <CampaignFormFields form={form} />

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
