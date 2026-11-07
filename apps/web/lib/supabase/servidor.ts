import 'server-only'
import type { ClienteBanco, Database } from '@norteia/db'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { configSupabase } from '@/lib/env'

/** Cliente do Supabase com a sessão do usuário (RLS aplicada). Use em Server Components e Actions. */
export async function clienteServidor(): Promise<ClienteBanco> {
  const { url, chave } = configSupabase()
  const loja = await cookies()
  return createServerClient<Database>(url, chave, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        try {
          for (const { name, value, options } of lista) loja.set(name, value, options)
        } catch {
          // Em Server Components os cookies são somente leitura; o proxy renova a sessão.
        }
      },
    },
  })
}
