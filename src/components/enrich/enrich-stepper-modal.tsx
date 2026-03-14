'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

import type { Campaign } from '@/types/campaign'
import type { EnrichEvent, EnrichProgressEvent } from '@/lib/enrich-emitter'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── tipos ────────────────────────────────────────────────────────────────────

export type StepperMode = 'full' | 'analyze'

type StepStatus = 'pending' | 'active' | 'done' | 'error'

interface StepDef {
  label:    string
  subStage: EnrichProgressEvent['stage'] | 'classify' | 'done' | null
}

const STEPS: StepDef[] = [
  { label: 'Classificando leads',          subStage: 'classify'    },
  { label: 'Salvando leads sem site',      subStage: null          },
  { label: 'Tirando screenshots',          subStage: 'screenshot'  },
  { label: 'Salvando no Storage',          subStage: 'upload'      },
  { label: 'Baixando código fonte',        subStage: 'html'        },
  { label: 'Analisando com IA',            subStage: 'ai'          },
  { label: 'Salvando análises',            subStage: 'save'        },
  { label: 'Concluído',                    subStage: 'done'        },
]

interface StepState {
  status:  StepStatus
  subtext: string
}

function initialSteps(mode: StepperMode): StepState[] {
  if (mode === 'analyze') {
    return STEPS.map((_, i) => ({
      status:  i < 5 ? 'done' : 'pending',
      subtext: '',
    }))
  }
  return STEPS.map(() => ({ status: 'pending' as StepStatus, subtext: '' }))
}

// ─── step icon ────────────────────────────────────────────────────────────────

function StepIcon({ index, status }: { index: number; status: StepStatus }) {
  if (status === 'done')
    return <CheckCircle2 className="h-6 w-6 shrink-0 text-green-500" />
  if (status === 'error')
    return <XCircle className="h-6 w-6 shrink-0 text-red-500" />
  if (status === 'active')
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
        {index + 1}
      </span>
    )
  // pending
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
      {index + 1}
    </span>
  )
}

// ─── component ────────────────────────────────────────────────────────────────

interface EnrichStepperModalProps {
  campaign: Campaign | null
  mode:     StepperMode
  open:     boolean
  onOpenChange: (open: boolean) => void
}

export function EnrichStepperModal({
  campaign,
  mode,
  open,
  onOpenChange,
}: EnrichStepperModalProps) {
  const router = useRouter()
  const [steps, setSteps]       = useState<StepState[]>(() => initialSteps(mode))
  const [isDone, setIsDone]     = useState(false)
  const [hasError, setHasError] = useState(false)
  const [phase, setPhase]       = useState<'screenshot' | 'analyze'>('screenshot')

  const esRef        = useRef<EventSource | null>(null)
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (open && campaign) {
      setSteps(initialSteps(mode))
      setIsDone(false)
      setHasError(false)
      setPhase(mode === 'analyze' ? 'analyze' : 'screenshot')
      startFlow(mode === 'analyze' ? 'analyze' : 'screenshot')
    }
    return () => {
      esRef.current?.close()
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function setStep(index: number, patch: Partial<StepState>) {
    setSteps((prev) => prev.map((s, i) => i === index ? { ...s, ...patch } : s))
  }

  function connectSSE(campaignId: string, currentPhase: 'screenshot' | 'analyze') {
    esRef.current?.close()

    const es = new EventSource(`/api/enrich/progress/${campaignId}`)
    esRef.current = es

    // Safety timeout: 15 min
    const tid = setTimeout(() => {
      es.close()
      markError('Timeout: processo demorou mais que 15 minutos.')
    }, 15 * 60 * 1000)
    timeoutRef.current = tid

    es.onmessage = (e: MessageEvent) => {
      let event: EnrichEvent
      try { event = JSON.parse(e.data) } catch { return }

      if (event.type === 'classify') {
        // Steps 1 + 2 done, step 3 active
        setSteps((prev) => prev.map((s, i) => {
          if (i === 0 || i === 1) return { ...s, status: 'done' }
          if (i === 2)            return { ...s, status: 'active' }
          return s
        }))
      } else if (event.type === 'progress') {
        const subtext = `Processando lead ${event.current} de ${event.total}${event.lead_name ? ` — ${event.lead_name}` : ''}`
        const stageIdx = stageToStepIndex(event.stage)
        if (stageIdx !== -1) {
          setSteps((prev) => prev.map((s, i) => {
            if (i < stageIdx)   return { ...s, status: 'done',   subtext: '' }
            if (i === stageIdx) return { ...s, status: 'active', subtext }
            return s
          }))
        }
      } else if (event.type === 'done') {
        clearTimeout(tid)
        es.close()
        esRef.current = null

        if (currentPhase === 'screenshot') {
          // Mark steps 1-5 done, trigger analyze phase
          setSteps((prev) => prev.map((s, i) =>
            i <= 4 ? { ...s, status: 'done', subtext: '' } : s
          ))

          if (event.success === 0 && (event.unavailable ?? 0) === 0) {
            // Nothing to analyze
            finishAll()
          } else {
            setPhase('analyze')
            triggerAnalyze()
          }
        } else {
          // analyze phase done
          setSteps((prev) => prev.map((s, i) =>
            i <= 6 ? { ...s, status: 'done', subtext: '' } : s
          ))
          finishAll()

          const parts: string[] = []
          if (event.success > 0) parts.push(`${event.success} análise(s) concluída(s)`)
          if (event.failed  > 0) parts.push(`${event.failed} falha(s)`)
          if (parts.length > 0) {
            if (event.failed > 0) toast.warning(`Concluído: ${parts.join(', ')}.`)
            else                  toast.success(`Concluído: ${parts.join(', ')}.`)
          }
          router.refresh()
        }
      }
    }

    es.onerror = () => {
      clearTimeout(tid)
      es.close()
      esRef.current = null
      markError('Conexão SSE encerrada inesperadamente.')
    }
  }

  async function startFlow(currentPhase: 'screenshot' | 'analyze') {
    if (!campaign) return

    // Step 1 active immediately
    if (currentPhase === 'screenshot') {
      setStep(0, { status: 'active', subtext: 'Classificando leads…' })
    }

    try {
      const endpoint = currentPhase === 'screenshot' ? '/api/enrich/start' : '/api/enrich/analyze'
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ campaign_id: campaign.id }),
      })
      const data: { ok: boolean; error?: string; total?: number; with_site?: number } = await res.json()

      if (!data.ok) {
        markError(data.error ?? 'Erro ao iniciar operação')
        return
      }

      const count = currentPhase === 'screenshot' ? (data.with_site ?? 0) : (data.total ?? 0)

      if (count === 0) {
        // Nothing to process
        if (currentPhase === 'screenshot') {
          setSteps((prev) => prev.map((s, i) =>
            i <= 4 ? { ...s, status: 'done', subtext: '' } : s
          ))
          triggerAnalyze()
        } else {
          finishAll()
          router.refresh()
        }
        return
      }

      connectSSE(campaign.id, currentPhase)
    } catch {
      markError('Erro de conexão — verifique se o servidor está rodando.')
    }
  }

  async function triggerAnalyze() {
    if (!campaign) return
    setStep(5, { status: 'active', subtext: 'Iniciando análise…' })
    try {
      const res  = await fetch('/api/enrich/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ campaign_id: campaign.id }),
      })
      const data: { ok: boolean; error?: string; total?: number } = await res.json()

      if (!data.ok) {
        markError(data.error ?? 'Erro ao iniciar análise de IA')
        return
      }

      if ((data.total ?? 0) === 0) {
        finishAll()
        router.refresh()
        return
      }

      connectSSE(campaign.id, 'analyze')
    } catch {
      markError('Erro de conexão durante análise de IA.')
    }
  }

  function finishAll() {
    setSteps((prev) => prev.map((s) => ({ ...s, status: 'done' as StepStatus, subtext: '' })))
    setIsDone(true)
  }

  function markError(msg: string) {
    setSteps((prev) => prev.map((s) =>
      s.status === 'active' ? { ...s, status: 'error', subtext: msg } : s
    ))
    setHasError(true)
    toast.error(msg)
  }

  function stageToStepIndex(stage: EnrichProgressEvent['stage']): number {
    const map: Record<EnrichProgressEvent['stage'], number> = {
      screenshot: 2,
      upload:     3,
      html:       4,
      ai:         5,
      save:       6,
    }
    return map[stage] ?? -1
  }

  const canClose = isDone || hasError

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { if (!o && canClose) onOpenChange(false) }}
    >
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => { if (!canClose) e.preventDefault() }}
        onEscapeKeyDown={(e) => { if (!canClose) e.preventDefault() }}
      >
        <DialogHeader>
          <DialogTitle className="truncate text-base">
            {mode === 'analyze' ? 'Analisando com IA' : 'Enriquecendo leads'}
          </DialogTitle>
          {campaign && (
            <p className="truncate text-xs text-muted-foreground">{campaign.name}</p>
          )}
        </DialogHeader>

        {/* Stepper */}
        <ol className="flex flex-col gap-1 py-2">
          {STEPS.map((step, i) => {
            const s = steps[i]
            return (
              <li key={i} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
                  {s.status === 'active'
                    ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600" />
                    : <StepIcon index={i} status={s.status} />
                  }
                  <span className={`text-sm font-medium leading-tight ${
                    s.status === 'pending' ? 'text-muted-foreground' :
                    s.status === 'active'  ? 'text-foreground' :
                    s.status === 'done'    ? 'text-foreground' :
                    'text-red-600'
                  }`}>
                    {step.label}
                    {s.status === 'done' && i === 7 && ' ✅'}
                  </span>
                </div>
                {s.subtext && (
                  <p className={`pl-11 text-xs ${s.status === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {s.subtext}
                  </p>
                )}
              </li>
            )
          })}
        </ol>

        {/* Footer */}
        {isDone && campaign && (
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Fechar
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => {
                onOpenChange(false)
                router.push(`/enrich/${campaign.id}`)
              }}
            >
              <ExternalLink className="h-4 w-4" />
              Ver resultados
            </Button>
          </div>
        )}

        {hasError && (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </Button>
        )}
      </DialogContent>
    </Dialog>
  )
}
