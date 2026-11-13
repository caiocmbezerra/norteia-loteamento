'use server'

import { clienteServidor } from '@/lib/supabase/servidor'

export interface EstadoDescadastro {
  feito?: string
  erro?: string
}

/** Opt-out dos lembretes por e-mail (RN-K10), sem login: o token do link identifica o comprador. */
export async function descadastrar(
  token: string,
  _: EstadoDescadastro,
): Promise<EstadoDescadastro> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { erro: 'Link inválido.' }
  const db = await clienteServidor()
  const { data, error } = await db.rpc('descadastrar_lembretes', { p_token: token })
  if (error) return { erro: 'Link inválido ou expirado.' }
  return { feito: data }
}
