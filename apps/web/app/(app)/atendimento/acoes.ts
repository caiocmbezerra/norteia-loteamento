'use server'

import { mudarSituacaoChamado, responderChamado } from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

export async function responderAtendimento(
  chamadoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const texto = z
      .string()
      .trim()
      .min(1, 'Escreva a resposta.')
      .max(4000)
      .parse(form.get('texto') ?? '')
    await responderChamado(ctx.db, chamadoId, texto)
  } catch (e) {
    if (e instanceof z.ZodError)
      return { erros: { texto: e.issues[0]?.message ?? 'Mensagem inválida.' } }
    return estadoDeErro(e, form)
  }
  revalidatePath('/atendimento', 'layout')
  return {}
}

export async function alternarResolvido(chamadoId: string, resolvido: boolean) {
  const ctx = await exigirContexto()
  await mudarSituacaoChamado(ctx.db, chamadoId, resolvido ? 'resolvido' : 'em_atendimento')
  revalidatePath('/atendimento', 'layout')
}
