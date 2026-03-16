'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Megaphone, Users, Database, Sparkles, Settings, Send, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

const PHASE1_NAV = [
  { label: 'Dashboard',  href: '/dashboard', icon: LayoutDashboard },
  { label: 'Campanhas',  href: '/campaigns', icon: Megaphone },
  { label: 'Leads',      href: '/leads',     icon: Users },
]

const PHASE2_NAV = [
  { label: 'Enriquecer Leads', href: '/enrich',       icon: Sparkles      },
  { label: 'Disparos',         href: '/outreach',      icon: Send          },
  { label: 'Conversas',        href: '/conversations', icon: MessageSquare },
]

const ALL_NAV = [...PHASE1_NAV, ...PHASE2_NAV]

export function Sidebar() {
  const pathname = usePathname()
  const isSettings = pathname === '/settings' || pathname.startsWith('/settings/')

  const iconLinkClass = (href: string) =>
    cn(
      'flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
      pathname === href || pathname.startsWith(href + '/')
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    )

  const linkClass = (href: string) =>
    cn(
      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
      pathname === href || pathname.startsWith(href + '/')
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    )

  // ── Modo colapsado (só ícones) quando em /settings ─────────────────────────
  if (isSettings) {
    return (
      <aside className="flex h-screen w-16 shrink-0 flex-col items-center border-r border-border bg-card py-3 gap-1">
        {/* logo */}
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary mb-1">
          <Database className="h-4 w-4 text-primary-foreground" />
        </div>

        <Separator className="w-8 my-1" />

        {/* todas as rotas */}
        {ALL_NAV.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href} title={label} className={iconLinkClass(href)}>
            <Icon className="h-4 w-4 shrink-0" />
          </Link>
        ))}

        {/* settings (ativo) */}
        <div className="mt-auto mb-1">
          <Separator className="w-8 mb-2" />
          <Link href="/settings" title="Configurações" className={iconLinkClass('/settings')}>
            <Settings className="h-4 w-4 shrink-0" />
          </Link>
        </div>
      </aside>
    )
  }

  // ── Modo normal ────────────────────────────────────────────────────────────
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-card">

      {/* ── Fase 1 brand ─────────────────────────────────────────────────────── */}
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary">
          <Database className="h-4 w-4 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight text-foreground">
            CRM Scraping
          </span>
          <span className="text-xs text-muted-foreground">Fase 1</span>
        </div>
      </div>

      <Separator />

      {/* ── Fase 1 nav ───────────────────────────────────────────────────────── */}
      <nav className="flex flex-col gap-1 p-4">
        {PHASE1_NAV.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href} className={linkClass(href)}>
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <Separator />

      {/* ── Fase 2 brand ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight text-foreground">
            CRM — Enriquecer
          </span>
          <span className="text-xs text-muted-foreground">Fase 2</span>
        </div>
      </div>

      {/* ── Fase 2 nav ───────────────────────────────────────────────────────── */}
      <nav className="flex flex-col gap-1 px-4 pb-4">
        {PHASE2_NAV.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href} className={linkClass(href)}>
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <div className="mt-auto">
        <Separator />
        <div className="p-4 flex flex-col gap-1">
          <Link href="/settings" className={linkClass('/settings')}>
            <Settings className="h-4 w-4 shrink-0" />
            Configurações
          </Link>
          <p className="px-3 text-xs text-muted-foreground">v1.0.0 · Fase 1 & 2</p>
        </div>
      </div>

    </aside>
  )
}
