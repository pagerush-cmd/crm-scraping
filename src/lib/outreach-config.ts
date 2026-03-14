export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'responding'
  | 'interested'
  | 'negotiating'
  | 'waiting_human'
  | 'proposal_sent'
  | 'closed_won'
  | 'closed_lost'
  | 'no_contact'

export const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  new:           { label: 'Novo',             bg: 'bg-slate-100',  text: 'text-slate-700',  dot: 'bg-slate-400'  },
  contacted:     { label: 'Contatado',        bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  responding:    { label: 'Respondendo',      bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  interested:    { label: 'Interessado',      bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  negotiating:   { label: 'Negociando',       bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  waiting_human: { label: '⚠️ Humano',        bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  proposal_sent: { label: 'Proposta Enviada', bg: 'bg-cyan-100',   text: 'text-cyan-700',   dot: 'bg-cyan-500'   },
  closed_won:    { label: '✅ Fechado',        bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  closed_lost:   { label: '❌ Perdido',        bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-400'    },
  no_contact:    { label: 'Sem Resposta',     bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
}

export const TAB_FILTERS: { key: LeadStatus | 'all'; label: string }[] = [
  { key: 'all',           label: 'Todos'         },
  { key: 'contacted',     label: 'Contatados'    },
  { key: 'responding',    label: 'Respondendo'   },
  { key: 'interested',    label: 'Interessados'  },
  { key: 'negotiating',   label: 'Negociando'    },
  { key: 'waiting_human', label: '⚠️ Humano'     },
  { key: 'closed_won',    label: '✅ Fechados'    },
  { key: 'closed_lost',   label: '❌ Perdidos'    },
]
