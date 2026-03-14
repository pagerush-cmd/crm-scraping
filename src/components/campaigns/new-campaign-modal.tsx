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
  campaignFormDefaults,
  toSlug,
  type CampaignFormValues,
} from './campaign-form-fields'

interface NewCampaignModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (campaign: Campaign) => void
}

export function NewCampaignModal({ open, onOpenChange, onCreated }: NewCampaignModalProps) {
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: campaignFormDefaults,
  })

  useEffect(() => {
    if (open) form.reset(campaignFormDefaults)
  }, [open, form])

  async function onSubmit(values: CampaignFormValues) {
    const cityFormatted = `${values.city} - ${values.uf}`
    const name =
      values.name.trim() ||
      `${toSlug(values.niche)}_${toSlug(values.city)}_${values.uf.toLowerCase()}`

    try {
      const res = await fetch('/api/campaigns/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          city:        cityFormatted,
          niche:       values.niche,
          daily_limit: values.daily_limit,
        }),
      })
      const data: { ok: boolean; campaign?: Campaign; error?: string } = await res.json()

      if (!res.ok || !data.ok || !data.campaign) {
        toast.error(data.error ?? `Erro ${res.status} ao criar campanha`)
        return
      }

      toast.success(`Campanha "${data.campaign.name}" criada!`)
      onCreated(data.campaign)
      onOpenChange(false)
    } catch {
      toast.error('Erro de conexão ao criar campanha')
    }
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
          <DialogDescription>
            Configure uma nova campanha de coleta de leads.
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
                {isSubmitting ? 'Criando…' : 'Criar campanha'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
