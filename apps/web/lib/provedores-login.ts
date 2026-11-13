import { configSupabase } from '@/lib/env'

/** Se o login com o Google está ligado no Supabase (Authentication → Providers). */
export async function googleLigado(): Promise<boolean> {
  try {
    const { url, chave } = configSupabase()
    const r = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: chave },
      next: { revalidate: 300 },
    })
    if (!r.ok) return false
    const dados = (await r.json()) as { external?: { google?: boolean } }
    return dados.external?.google === true
  } catch {
    return false
  }
}
