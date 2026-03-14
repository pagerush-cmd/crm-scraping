import { createClient } from '@supabase/supabase-js'

/**
 * Factory que retorna um cliente Supabase para uso em Server Components.
 * Usa somente a anon key — sem service_role no front-end.
 * Chame dentro de cada função/page para evitar estado compartilhado entre requests.
 */
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
