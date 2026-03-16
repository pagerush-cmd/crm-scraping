import { createClient } from '@supabase/supabase-js'
import { Settings } from 'lucide-react'

import { SettingsForm } from '@/components/settings/settings-form'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = createServiceClient()
  const { data } = await supabase.from('settings').select('key, value')

  // Env vars como fallback para campos da Evolution API
  const defaults: Record<string, string> = {
    evolution_api_url:         process.env.EVOLUTION_API_URL          ?? '',
    evolution_api_key:         process.env.EVOLUTION_API_KEY          ?? '',
    evolution_instance_name:   process.env.EVOLUTION_INSTANCE_NAME    ?? '',
    screenshotone_access_key:  process.env.SCREENSHOTONE_ACCESS_KEY   ?? '',
    screenshotone_secret_key:  process.env.SCREENSHOTONE_SECRET_KEY   ?? '',
  }

  const fromDb = Object.fromEntries((data ?? []).map((s) => [s.key, s.value as string]))
  const initialValues = { ...defaults, ...fromDb }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
          <Settings className="h-5 w-5 text-muted-foreground" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Configurações</h1>
          <p className="text-sm text-muted-foreground">Gerencie as configurações do sistema</p>
        </div>
      </div>

      <SettingsForm initialValues={initialValues} />
    </div>
  )
}
