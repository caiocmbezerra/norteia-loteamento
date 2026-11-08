'use server'

import { ErroAplicacao, aceitarConvitePortal } from '@norteia/aplicacao'
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/contexto'

export async function aceitarPortal(
  token: string,
  _: { erro?: string },
): Promise<{ erro?: string }> {
  const { db } = await exigirUsuario()
  try {
    await aceitarConvitePortal(db, token)
  } catch (e) {
    if (e instanceof ErroAplicacao) return { erro: e.message }
    throw e
  }
  redirect('/portal')
}
