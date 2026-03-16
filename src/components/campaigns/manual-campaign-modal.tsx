'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import type { Campaign } from '@/types/campaign'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const schema = z.object({
  name:        z.string().min(1, 'Nome obrigatório'),
  city:        z.string().optional(),
  niche:       z.string().optional(),
  daily_limit: z.number().min(1).max(500),
})

type FormValues = z.infer<typeof schema>

const defaults: FormValues = { name: 'Manual', city: '', niche: 'Manual', daily_limit: 50 }

interface ManualCampaignModalProps {
  open:         boolean
  onOpenChange: (open: boolean) => void
  onCreated:    (campaign: Campaign) => void
}

export function ManualCampaignModal({ open, onOpenChange, onCreated }: ManualCampaignModalProps) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  useEffect(() => { if (open) form.reset(defaults) }, [open, form])

  async function onSubmit(values: FormValues) {
    try {
      const res = await fetch('/api/campaigns/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:        values.name.trim(),
          city:        values.city?.trim() || 'Manual',
          niche:       values.niche?.trim() || 'Manual',
          daily_limit: values.daily_limit,
        }),
      })
      const data: { ok: boolean; campaign?: Campaign; error?: string } = await res.json()
      if (!res.ok || !data.campaign) {
        toast.error(data.error ?? 'Erro ao criar campanha')
        return
      }
      toast.success(`Campanha "${data.campaign.name}" criada!`)
      onCreated(data.campaign)
      onOpenChange(false)
    } catch {
      toast.error('Erro de conexão')
    }
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Campanha Manual</DialogTitle>
          <DialogDescription className="text-xs">
            Campanha para adicionar leads manualmente — sem coleta automática.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl><Input placeholder="ex: Teste Disparo" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cidade <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                  <FormControl><Input placeholder="ex: São Paulo - SP" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="niche"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nicho <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                  <FormControl><Input placeholder="ex: Odontologia" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="daily_limit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Limite diário de disparo</FormLabel>
                  <FormControl>
                    <Input
                      type="number" min={1} max={500} className="w-28"
                      {...field} onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">Máximo de mensagens por dia.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
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
