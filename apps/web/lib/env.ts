/** Variáveis públicas do Supabase. Valores locais em `.env.local` (ver `.env.example`). */
export function configSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !chave) {
    throw new Error(
      'Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veja apps/web/.env.example).',
    )
  }
  return { url, chave }
}
