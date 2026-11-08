'use server'

import { ErroAplicacao, emitirSegundaVia } from '@norteia/aplicacao'
import { redirect } from 'next/navigation'
import { exigirUsuario } from '@/lib/contexto'

/** Segunda via: abre o boleto/Pix da parcela (o pendente ou um emitido agora no Asaas). */
export async function segundaVia(
  parcelaId: string,
  _: { erro?: string },
): Promise<{ erro?: string }> {
  const { db } = await exigirUsuario()
  let link: string
  try {
    link = await emitirSegundaVia(db, parcelaId)
  } catch (e) {
    if (e instanceof ErroAplicacao) return { erro: e.message }
    throw e
  }
  redirect(link)
}
