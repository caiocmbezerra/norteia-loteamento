'use server'

import { traduzirErroBanco } from '@norteia/aplicacao'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { COOKIE_TENANT, exigirUsuario } from '@/lib/contexto'

export async function aceitarConvite(
  token: string,
  _: { erro?: string },
): Promise<{ erro?: string }> {
  const { db } = await exigirUsuario()
  const { data: tenantId, error } = await db.rpc('aceitar_convite', { p_token: token })
  if (error) return { erro: traduzirErroBanco(error).message }
  ;(await cookies()).set(COOKIE_TENANT, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  redirect('/painel')
}
