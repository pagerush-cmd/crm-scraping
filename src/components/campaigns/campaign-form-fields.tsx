'use client'

import { z } from 'zod'
import type { UseFormReturn } from 'react-hook-form'

import { NICHES } from '@/lib/niches'
import { BR_LOCATIONS, BRAZIL_STATES } from '@/lib/br-locations'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ─── schema e tipos exportados ────────────────────────────────────────────────

export const campaignFormSchema = z.object({
  name:        z.string(),
  uf:          z.string().min(1, 'Selecione um estado'),
  city:        z.string().min(1, 'Selecione uma cidade'),
  niche:       z.string().min(1, 'Selecione um nicho'),
  daily_limit: z.number().min(1, 'Mínimo 1').max(200, 'Máximo 200'),
})

export type CampaignFormValues = z.infer<typeof campaignFormSchema>

export const campaignFormDefaults: CampaignFormValues = {
  name:        '',
  uf:          '',
  city:        '',
  niche:       '',
  daily_limit: 20,
}

// ─── helper ───────────────────────────────────────────────────────────────────

export function toSlug(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

/**
 * Faz o parse de "Guarulhos - SP" → { city: "Guarulhos", uf: "SP" }
 * Lida com cidades que contenham " - " no nome.
 */
export function parseCityString(cityStr: string): { city: string; uf: string } {
  const lastDash = cityStr.lastIndexOf(' - ')
  if (lastDash !== -1) {
    return {
      city: cityStr.substring(0, lastDash).trim(),
      uf:   cityStr.substring(lastDash + 3).trim(),
    }
  }
  return { city: cityStr, uf: '' }
}

// ─── component ────────────────────────────────────────────────────────────────

interface CampaignFormFieldsProps {
  form: UseFormReturn<CampaignFormValues>
}

export function CampaignFormFields({ form }: CampaignFormFieldsProps) {
  const watchedUf = form.watch('uf')

  // Cidades do UF selecionado
  const cityOptions = BR_LOCATIONS[watchedUf] ?? []

  return (
    <>
      {/* Nome (opcional) */}
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nome (opcional)</FormLabel>
            <FormControl>
              <Input placeholder="advogados_guarulhos_sp" {...field} />
            </FormControl>
            <FormDescription className="text-xs">
              Deixe em branco para gerar automaticamente.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Estado + Cidade */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* UF — largura fixa */}
        <div className="w-full sm:w-36 sm:shrink-0">
          <FormField
            control={form.control}
            name="uf"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(val) => {
                    field.onChange(val)
                    form.setValue('city', '') // reset cidade ao trocar UF
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="w-full sm:w-36">
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-60">
                    {BRAZIL_STATES.map((s) => (
                      <SelectItem key={s.uf} value={s.uf}>
                        {s.uf} — {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Cidade — ocupa o espaço restante */}
        <div className="min-w-0 flex-1">
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cidade</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={cityOptions.length === 0}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue
                        placeholder={
                          watchedUf ? 'Selecione a cidade' : 'Selecione o estado primeiro'
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="max-h-60">
                    {cityOptions.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Nicho */}
      <FormField
        control={form.control}
        name="niche"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Nicho</FormLabel>
            <Select value={field.value} onValueChange={field.onChange}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o nicho" />
                </SelectTrigger>
              </FormControl>
              <SelectContent className="max-h-60">
                {NICHES.map((niche) => (
                  <SelectItem key={niche} value={niche}>
                    {niche}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Limite diário */}
      <FormField
        control={form.control}
        name="daily_limit"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Limite diário de coleta</FormLabel>
            <FormControl>
              <Input
                type="number"
                min={1}
                max={200}
                className="w-full sm:w-32"
                {...field}
                onChange={(e) => field.onChange(e.target.valueAsNumber)}
              />
            </FormControl>
            <FormDescription className="text-xs">
              Entre 1 e 200 leads por dia.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  )
}
