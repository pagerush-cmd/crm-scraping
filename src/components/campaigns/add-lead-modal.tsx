'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import type { Lead } from '@/types/lead'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const schema = z.object({
  company_name:  z.string().min(1, 'Nome obrigatório'),
  phone:         z.string().min(1, 'Telefone obrigatório'),
  category:      z.string().optional(),
  address:       z.string().optional(),
  website:       z.string().optional(),
  rating:        z.string().optional(),
  reviews_count: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const defaults: FormValues = {
  company_name: '', phone: '', category: '', address: '', website: '', rating: '', reviews_count: '',
}

interface AddLeadModalProps {
  campaignId:   string
  campaignName: string
  open:         boolean
  onOpenChange: (open: boolean) => void
  onAdded:      (lead: Lead) => void
}

export function AddLeadModal({ campaignId, campaignName, open, onOpenChange, onAdded }: AddLeadModalProps) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults })

  useEffect(() => { if (open) form.reset(defaults) }, [open, form])

  async function onSubmit(values: FormValues) {
    const rating        = values.rating        ? parseFloat(values.rating)        : null
    const reviews_count = values.reviews_count ? parseInt(values.reviews_count)   : null

    try {
      const res = await fetch('/api/leads/add', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          campaign_id:   campaignId,
          company_name:  values.company_name.trim(),
          phone:         values.phone.trim(),
          category:      values.category?.trim()  || undefined,
          address:       values.address?.trim()   || undefined,
          website:       values.website?.trim()   || undefined,
          rating:        isNaN(rating!)  ? null : rating,
          reviews_count: isNaN(reviews_count!) ? null : reviews_count,
        }),
      })
      const data: { ok: boolean; lead?: Lead; error?: string } = await res.json()
      if (!res.ok || !data.lead) {
        toast.error(data.error ?? 'Erro ao adicionar lead')
        return
      }
      toast.success(`Lead "${data.lead.company_name}" adicionado!`)
      onAdded(data.lead)
      form.reset(defaults)
    } catch {
      toast.error('Erro de conexão')
    }
  }

  const isSubmitting = form.formState.isSubmitting

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Adicionar Lead
          </DialogTitle>
          <DialogDescription className="text-xs">
            Campanha: <span className="font-semibold text-foreground">{campaignName}</span>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="company_name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Nome da empresa <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="ex: Clínica Dr. João" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Telefone / WhatsApp <span className="text-destructive">*</span></FormLabel>
                    <FormControl><Input placeholder="ex: 11999999999" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Categoria <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl><Input placeholder="ex: Odontologia" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Endereço <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl><Input placeholder="ex: Rua das Flores, 123 - SP" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Website <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl><Input placeholder="ex: https://clinica.com.br" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="rating"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avaliação <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl><Input type="number" step="0.1" min={0} max={5} placeholder="4.5" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="reviews_count"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº avaliações <span className="text-muted-foreground font-normal">(opcional)</span></FormLabel>
                    <FormControl><Input type="number" min={0} placeholder="120" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="mt-1">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting} className="gap-2">
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Adicionando…' : 'Adicionar lead'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
