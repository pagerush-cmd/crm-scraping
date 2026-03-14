'use client'

import { useState, useRef, useEffect } from 'react'
import {
  AlertTriangle, Bot, Camera, CheckCircle, CheckCircle2, ClipboardCopy,
  Loader2, MessageSquare, Save, Send, ShoppingBag, Wand2, Webhook, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge }     from '@/components/ui/badge'
import { Button }    from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input }     from '@/components/ui/input'
import { Label }     from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea }  from '@/components/ui/textarea'

// ─── tipos ────────────────────────────────────────────────────────────────────

type SettingsMap = Record<string, string>

interface FieldDef {
  key:          string
  label:        string
  description?: string
  type:         'text' | 'number' | 'textarea' | 'password' | 'date'
  placeholder?: string
  rows?:        number
}

// ─── campos por seção ─────────────────────────────────────────────────────────

const SERVICE_FIELDS: FieldDef[] = [
  { key: 'service_price',           label: 'Valor do serviço (R$)',   type: 'number',   placeholder: 'ex: 1500' },
  { key: 'service_description',     label: 'Descrição curta',         type: 'textarea', placeholder: 'ex: Landing page profissional com WhatsApp, SEO básico e design moderno' },
  { key: 'service_delivery_days',   label: 'Prazo de entrega (dias)', type: 'number',   placeholder: 'ex: 5' },
  { key: 'service_payment_methods', label: 'Formas de pagamento',     type: 'text',     placeholder: 'ex: PIX, cartão em até 3x' },
]

const AGENT_FIELDS: FieldDef[] = [
  { key: 'agent_name',        label: 'Nome do agente',    type: 'text',     placeholder: 'ex: Ana' },
  { key: 'agent_personality', label: 'Personalidade',     type: 'textarea', description: 'Como o agente deve se comportar nas conversas.', placeholder: 'ex: Consultiva, direta, sem enrolação. Fala como humano.' },
  { key: 'agent_goal',        label: 'Objetivo',          type: 'text',     placeholder: 'ex: Fechar a venda do site no próprio chat' },
  { key: 'portfolio_url',     label: 'Link do portfólio', type: 'text',     placeholder: 'ex: https://seusite.com/portfolio' },
]

const DISPATCH_FIELDS: FieldDef[] = [
  { key: 'outreach_daily_limit',  label: 'Limite diário de mensagens',          type: 'number', placeholder: 'ex: 30' },
  { key: 'outreach_delay_min',    label: 'Delay mínimo entre mensagens (seg)',  type: 'number', placeholder: 'ex: 30' },
  { key: 'outreach_delay_max',    label: 'Delay máximo entre mensagens (seg)',  type: 'number', placeholder: 'ex: 120' },
  { key: 'outreach_active_hours', label: 'Horário de disparo',                  type: 'text',   placeholder: 'ex: 08:00-18:00' },
  { key: 'outreach_active_days',  label: 'Dias ativos', description: 'Separados por vírgula.', type: 'text', placeholder: 'ex: seg,ter,qua,qui,sex' },
]

const WHATSAPP_FIELDS: FieldDef[] = [
  { key: 'evolution_api_url',       label: 'URL da API',        type: 'text',     placeholder: 'ex: https://sua-evolution-api.com' },
  { key: 'evolution_api_key',       label: 'Chave da API',      type: 'password', placeholder: '••••••••••••' },
  { key: 'evolution_instance_name', label: 'Nome da instância', type: 'text',     placeholder: 'ex: PageRush01' },
]

const SCREENSHOT_FIELDS: FieldDef[] = [
  { key: 'screenshotone_access_key', label: 'Access Key', type: 'password', placeholder: '••••••••••••' },
  { key: 'screenshotone_secret_key', label: 'Secret Key', type: 'password', placeholder: '••••••••••••' },
  { key: 'screenshotone_expires_at', label: 'Válida até', type: 'date',     placeholder: '' },
]

// ─── variáveis de template ────────────────────────────────────────────────────

const PROMPT_VARS_FIRST: string[] = [
  '{{company_name}}', '{{website}}', '{{category}}',
  '{{agent_name}}', '{{service_price}}', '{{service_description}}',
  '{{service_delivery_days}}', '{{service_payment_methods}}', '{{portfolio_url}}',
]

const PROMPT_VARS_AGENT: string[] = [
  ...PROMPT_VARS_FIRST,
  '{{design_score}}', '{{tech_score}}',
]

// ─── seções da sidebar ────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'service',    label: 'Serviço & Vendas',    Icon: ShoppingBag,   description: 'Preço, entrega e pagamento'    },
  { id: 'agent',      label: 'Agente IA',            Icon: Bot,           description: 'Nome, personalidade e objetivo' },
  { id: 'prompts',    label: 'Prompts IA',           Icon: Wand2,         description: 'Prompts de mensagens'          },
  { id: 'dispatch',   label: 'Disparo',              Icon: MessageSquare, description: 'Limites e horários'            },
  { id: 'whatsapp',   label: 'WhatsApp',             Icon: Webhook,       description: 'Evolution API'                },
  { id: 'screenshot', label: 'Screenshot',           Icon: Camera,        description: 'ScreenshotOne API'            },
  { id: 'simulator',  label: 'Simulador',            Icon: MessageSquare, description: 'Teste o agente ao vivo'       },
] as const

type SectionId = typeof SECTIONS[number]['id']

// ─── helper: salvar seção ─────────────────────────────────────────────────────

async function saveKeys(keys: string[], values: SettingsMap, label: string) {
  const settings = keys.map((k) => ({ key: k, value: values[k] ?? '' }))
  const res  = await fetch('/api/settings', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ settings }),
  })
  const data: { ok: boolean; error?: string } = await res.json()
  if (!data.ok) throw new Error(data.error ?? 'Erro desconhecido')
  toast.success(`"${label}" salvo com sucesso.`)
}

// ─── chip de variável de template ────────────────────────────────────────────

function VariableChip({ variable }: { variable: string }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(variable)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copiar ${variable}`}
      className="inline-flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied
        ? <CheckCircle className="h-3 w-3 text-green-500" />
        : <ClipboardCopy className="h-3 w-3" />
      }
      {variable}
    </button>
  )
}

// ─── renderização de campo ────────────────────────────────────────────────────

function Field({ field, value, onChange }: {
  field:    FieldDef
  value:    string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={field.key} className="text-sm font-medium">{field.label}</Label>
      {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
      {field.type === 'textarea' ? (
        <Textarea
          id={field.key}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={field.rows ?? 3}
          className={`text-sm ${(field.rows ?? 3) > 3 ? 'resize-y font-mono text-xs' : 'resize-none'}`}
        />
      ) : (
        <Input
          id={field.key}
          type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="text-sm"
        />
      )}
    </div>
  )
}

// ─── card de seção genérico ───────────────────────────────────────────────────

function SectionCard({ title, description, icon, fields, values, onChange }: {
  title:       string
  description: string
  icon:        React.ReactNode
  fields:      FieldDef[]
  values:      SettingsMap
  onChange:    (key: string, value: string) => void
}) {
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await saveKeys(fields.map((f) => f.key), values, title)
    } catch (err) {
      toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {icon}
          </span>
          <div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-col gap-5 pt-5">
        {fields.map((f) => (
          <Field key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => onChange(f.key, v)} />
        ))}
        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>
              : <><Save className="h-3.5 w-3.5" /> Salvar</>
            }
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── seção Prompts IA (cards separados com chips) ─────────────────────────────

function PromptCard({ fieldKey, title, description, vars, value, onChange, onSave }: {
  fieldKey:    string
  title:       string
  description: string
  vars:        string[]
  value:       string
  onChange:    (v: string) => void
  onSave:      () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try { await onSave() }
    catch (err) { toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`) }
    finally { setSaving(false) }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Wand2 className="h-4 w-4" />
          </span>
          <div>
            <CardTitle className="text-sm font-semibold">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-col gap-4 pt-5">
        <Textarea
          id={fieldKey}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={12}
          className="resize-y font-mono text-xs"
          placeholder="Ex: Você é {{agent_name}}, especialista em vendas…"
          style={{ minHeight: '200px' }}
        />
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Variáveis disponíveis</p>
          <div className="flex flex-wrap gap-1.5">
            {vars.map((v) => <VariableChip key={v} variable={v} />)}
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>
              : <><Save className="h-3.5 w-3.5" /> Salvar</>
            }
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PromptsSection({ values, onChange }: { values: SettingsMap; onChange: (k: string, v: string) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <PromptCard
        fieldKey="prompt_first_message"
        title="Primeira Mensagem"
        description="Gerado pelo Claude ao iniciar o contato com um lead."
        vars={PROMPT_VARS_FIRST}
        value={values['prompt_first_message'] ?? ''}
        onChange={(v) => onChange('prompt_first_message', v)}
        onSave={() => saveKeys(['prompt_first_message'], values, 'Prompt — Primeira Mensagem')}
      />
      <PromptCard
        fieldKey="prompt_agent_reply"
        title="Agente de Respostas"
        description="Quando o agente retornar HANDOFF, a IA pausa e notifica para atendimento humano."
        vars={PROMPT_VARS_AGENT}
        value={values['prompt_agent_reply'] ?? ''}
        onChange={(v) => onChange('prompt_agent_reply', v)}
        onSave={() => saveKeys(['prompt_agent_reply'], values, 'Prompt — Agente de Respostas')}
      />
    </div>
  )
}

// ─── seção WhatsApp (com teste inline) ───────────────────────────────────────

function WhatsAppSection({ values, onChange }: { values: SettingsMap; onChange: (k: string, v: string) => void }) {
  const [saving,     setSaving]     = useState(false)
  const [testNumber, setTestNumber] = useState('')
  const [testing,    setTesting]    = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  async function handleSave() {
    setSaving(true)
    try { await saveKeys(WHATSAPP_FIELDS.map((f) => f.key), values, 'WhatsApp API') }
    catch (err) { toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`) }
    finally { setSaving(false) }
  }

  async function handleTest() {
    if (!testNumber.trim()) return
    setTesting(true)
    setTestResult(null)
    try {
      const res  = await fetch('/api/outreach/test-connection', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ number: testNumber.trim() }),
      })
      const data: { success: boolean; error?: string } = await res.json()
      setTestResult({ ok: data.success, error: data.error })
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Webhook className="h-4 w-4" />
          </span>
          <div>
            <CardTitle className="text-sm font-semibold">WhatsApp API</CardTitle>
            <CardDescription className="text-xs">Configurações de conexão com a Evolution API.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-col gap-5 pt-5">
        {WHATSAPP_FIELDS.map((f) => (
          <Field key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => onChange(f.key, v)} />
        ))}
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>
              : <><Save className="h-3.5 w-3.5" /> Salvar</>
            }
          </Button>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Testar conexão</p>
          <div className="flex gap-2">
            <Input
              placeholder="Número de teste (ex: 11959356529)"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTest() }}
              className="font-mono text-sm"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={handleTest}
              disabled={testing || !testNumber.trim()}
              className="shrink-0 gap-1.5"
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Testar'}
            </Button>
          </div>
          {testResult && (
            <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${
              testResult.ok ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'
            }`}>
              {testResult.ok
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                : <XCircle      className="h-4 w-4 shrink-0 text-red-600" />
              }
              <span className={`text-xs font-medium ${testResult.ok ? 'text-green-700' : 'text-red-700'}`}>
                {testResult.ok ? 'Mensagem enviada com sucesso!' : `Erro: ${testResult.error}`}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── seção Screenshot (com status badge + teste) ──────────────────────────────

function ScreenshotStatusBadge({ expiresAt }: { expiresAt: string }) {
  if (!expiresAt) return null
  const expiry   = new Date(expiresAt)
  const now      = new Date()
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  if (daysLeft < 0) return <Badge className="border-transparent bg-red-100 text-red-700">Expirado</Badge>
  if (daysLeft < 3) return <Badge className="border-transparent bg-amber-100 text-amber-700">Expira em {daysLeft} dias</Badge>
  return <Badge className="border-transparent bg-green-100 text-green-700">Ativo · {daysLeft} dias restantes</Badge>
}

function ScreenshotSection({ values, onChange }: { values: SettingsMap; onChange: (k: string, v: string) => void }) {
  const [saving,   setSaving]   = useState(false)
  const [testing,  setTesting]  = useState(false)
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  const [thumbErr, setThumbErr] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    try { await saveKeys(SCREENSHOT_FIELDS.map((f) => f.key), values, 'ScreenshotOne') }
    catch (err) { toast.error(`Erro ao salvar: ${err instanceof Error ? err.message : String(err)}`) }
    finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true)
    setThumbUrl(null)
    setThumbErr(null)
    try {
      const res = await fetch('/api/settings/test-screenshot')
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`)
      }
      const blob = await res.blob()
      setThumbUrl(URL.createObjectURL(blob))
    } catch (err) {
      setThumbErr(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Camera className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="text-sm font-semibold">ScreenshotOne</CardTitle>
              <CardDescription className="text-xs">API de screenshots para enriquecimento de leads.</CardDescription>
            </div>
          </div>
          <ScreenshotStatusBadge expiresAt={values['screenshotone_expires_at'] ?? ''} />
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="flex flex-col gap-5 pt-5">
        {SCREENSHOT_FIELDS.map((f) => (
          <Field key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => onChange(f.key, v)} />
        ))}
        <div className="flex justify-end">
          <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</>
              : <><Save className="h-3.5 w-3.5" /> Salvar</>
            }
          </Button>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Testar screenshot</p>
          <Button
            size="sm"
            variant="outline"
            onClick={handleTest}
            disabled={testing}
            className="w-fit gap-1.5"
          >
            {testing
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturando google.com…</>
              : <><Camera className="h-3.5 w-3.5" /> Testar screenshot</>
            }
          </Button>

          {thumbErr && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5 dark:bg-red-950/30">
              <XCircle className="h-4 w-4 shrink-0 text-red-600" />
              <span className="text-xs font-medium text-red-700">{thumbErr}</span>
            </div>
          )}

          {thumbUrl && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 dark:bg-green-950/30">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                <span className="text-xs font-medium text-green-700">Screenshot capturado com sucesso!</span>
              </div>
              <img
                src={thumbUrl}
                alt="Screenshot de teste"
                className="w-full rounded-xl border object-cover shadow-sm"
                style={{ maxHeight: '280px' }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── seção Simulador (full-area, sem card wrapper) ────────────────────────────

type ChatMsg = { from: 'ana' | 'lead'; text: string }

interface ConversationSession {
  leadId:  string
  company: string
  msgs:    ChatMsg[]
  handoff: boolean
}

function SimulatorSection() {
  const [number,   setNumber]   = useState('')
  const [starting, setStarting] = useState(false)
  const [session,  setSession]  = useState<ConversationSession | null>(null)
  const [reply,    setReply]    = useState('')
  const [sending,  setSending]  = useState(false)

  const feedRef  = useRef<HTMLDivElement>(null)
  const replyRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
  }, [session?.msgs])

  async function handleStart() {
    if (!number.trim()) return
    setStarting(true)
    try {
      const res  = await fetch('/api/outreach/generate-message', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ test_number: number.trim() }),
      })
      const data: { message?: string; lead_id?: string; company_name?: string; error?: string } = await res.json()
      if (!res.ok || !data.message) throw new Error(data.error ?? 'Erro ao gerar mensagem')
      setSession({
        leadId:  data.lead_id!,
        company: data.company_name ?? 'Lead',
        msgs:    [{ from: 'ana', text: data.message }],
        handoff: false,
      })
      setTimeout(() => replyRef.current?.focus(), 50)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  async function handleSend() {
    if (!session || !reply.trim() || session.handoff) return
    const text = reply.trim()
    setReply('')
    const updatedMsgs: ChatMsg[] = [...session.msgs, { from: 'lead', text }]
    setSession((prev) => prev ? { ...prev, msgs: updatedMsgs } : null)
    setSending(true)
    try {
      const history = session.msgs.map((m) => ({ role: m.from === 'ana' ? 'assistant' : 'user', content: m.text }))
      const res  = await fetch('/api/outreach/agent-reply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ lead_id: session.leadId, last_message: text, conversation_history: history, test_number: number.trim() }),
      })
      const data: { message?: string; handoff?: boolean; error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Erro ao gerar resposta')
      if (data.handoff) {
        setSession((prev) => prev ? { ...prev, handoff: true } : null)
      } else {
        setSession((prev) => prev ? { ...prev, msgs: [...prev.msgs, { from: 'ana', text: data.message! }] } : null)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
      setReply(text)
    } finally {
      setSending(false)
      setTimeout(() => replyRef.current?.focus(), 50)
    }
  }

  return (
    <div className="flex h-full flex-col gap-5">
      {/* header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">Simulador de Conversa</h2>
        <p className="text-sm text-muted-foreground">Teste o agente ao vivo — as mensagens chegam no seu WhatsApp.</p>
      </div>

      <Separator />

      {/* número + controle */}
      <div className="flex gap-2">
        <Input
          placeholder="Número de teste (ex: 11959356529)"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !session) handleStart() }}
          disabled={!!session}
          className="font-mono text-sm"
        />
        {!session ? (
          <Button size="sm" onClick={handleStart} disabled={starting || !number.trim()} className="shrink-0">
            {starting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Iniciando…</> : 'Iniciar conversa'}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => { setSession(null); setReply('') }} className="shrink-0">
            Encerrar
          </Button>
        )}
      </div>

      {!session && (
        <p className="text-xs text-muted-foreground">
          Informe seu número, clique em "Iniciar conversa" e a primeira mensagem chegará no seu WhatsApp.
        </p>
      )}

      {session && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* identificação do lead */}
          <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 shrink-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
              {session.company.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">{session.company}</p>
              <p className="text-[10px] text-muted-foreground">Lead de teste · mensagens chegam em {number}</p>
            </div>
          </div>

          {/* feed de mensagens */}
          <div
            ref={feedRef}
            className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl border bg-muted/20 p-3"
            style={{ minHeight: '240px' }}
          >
            {session.msgs.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === 'lead' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                  msg.from === 'ana'
                    ? 'rounded-tl-sm border bg-card text-foreground'
                    : 'rounded-tr-sm bg-primary text-primary-foreground'
                }`}>
                  {msg.from === 'ana' && (
                    <p className="mb-0.5 text-[10px] font-semibold text-muted-foreground">Ana</p>
                  )}
                  <p style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm border bg-card px-3 py-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {session.handoff && (
            <div className="flex shrink-0 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-800 dark:bg-red-950/30">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                Requer atendimento humano — o agente encerrou a automação.
              </p>
            </div>
          )}

          {!session.handoff && (
            <div className="flex shrink-0 gap-2">
              <Input
                ref={replyRef}
                placeholder="Simule a resposta do lead…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                disabled={sending}
                className="text-sm"
              />
              <Button size="sm" onClick={handleSend} disabled={sending || !reply.trim()} className="shrink-0">
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── component principal ──────────────────────────────────────────────────────

interface SettingsFormProps {
  initialValues: SettingsMap
}

export function SettingsForm({ initialValues }: SettingsFormProps) {
  const [values,        setValues]        = useState<SettingsMap>(initialValues)
  const [activeSection, setActiveSection] = useState<SectionId>('service')

  function onChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside className="flex w-62.5 shrink-0 flex-col gap-0.5 border-r bg-muted/20 p-3">
        {SECTIONS.map(({ id, label, Icon, description }) => {
          const active = activeSection === id
          return (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{label}</p>
                <p className={`truncate text-[11px] ${active ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                  {description}
                </p>
              </div>
            </button>
          )
        })}
      </aside>

      {/* ── Conteúdo ───────────────────────────────────────────────────────── */}
      <main className={`flex flex-1 flex-col overflow-y-auto ${activeSection === 'simulator' ? 'p-6' : 'p-6'}`}>
        {activeSection === 'service' && (
          <SectionCard
            title="Serviço & Vendas"
            description="Informações sobre o serviço oferecido aos leads."
            icon={<ShoppingBag className="h-4 w-4" />}
            fields={SERVICE_FIELDS}
            values={values}
            onChange={onChange}
          />
        )}

        {activeSection === 'agent' && (
          <SectionCard
            title="Agente IA"
            description="Configurações de personalidade e objetivo do agente de vendas."
            icon={<Bot className="h-4 w-4" />}
            fields={AGENT_FIELDS}
            values={values}
            onChange={onChange}
          />
        )}

        {activeSection === 'prompts' && (
          <PromptsSection values={values} onChange={onChange} />
        )}

        {activeSection === 'dispatch' && (
          <SectionCard
            title="Disparo WhatsApp"
            description="Limites e horários para envio de mensagens."
            icon={<MessageSquare className="h-4 w-4" />}
            fields={DISPATCH_FIELDS}
            values={values}
            onChange={onChange}
          />
        )}

        {activeSection === 'whatsapp' && (
          <WhatsAppSection values={values} onChange={onChange} />
        )}

        {activeSection === 'screenshot' && (
          <ScreenshotSection values={values} onChange={onChange} />
        )}

        {activeSection === 'simulator' && (
          <SimulatorSection />
        )}
      </main>
    </div>
  )
}
