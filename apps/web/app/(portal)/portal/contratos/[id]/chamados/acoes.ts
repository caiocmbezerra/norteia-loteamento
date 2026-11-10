'use server'

import { CATEGORIAS_CHAMADO, abrirChamado, responderChamado } from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirUsuario } from '@/lib/contexto'

const categorias = Object.keys(CATEGORIAS_CHAMADO) as [keyof typeof CATEGORIAS_CHAMADO]

export async function abrirChamadoPortal(
  contratoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const { db } = await exigirUsuario()
  let id: string
  try {
    const d = z
      .object({
        assunto: z.string().trim().min(3, 'Assunto: ao menos 3 caracteres.').max(120),
        categoria: z.enum(categorias),
        texto: z.string().trim().min(1, 'Escreva a sua mensagem.').max(4000),
      })
      .parse(valoresDoFormulario(form))
    id = await abrirChamado(db, contratoId, d)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/portal/contratos/${contratoId}`)
  redirect(`/portal/contratos/${contratoId}/chamados/${id}`)
}

export async function responderChamadoPortal(
  contratoId: string,
  chamadoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const { db } = await exigirUsuario()
  try {
    const texto = z
      .string()
      .trim()
      .min(1, 'Escreva a sua mensagem.')
      .max(4000)
      .parse(form.get('texto') ?? '')
    await responderChamado(db, chamadoId, texto)
  } catch (e) {
    if (e instanceof z.ZodError)
      return { erros: { texto: e.issues[0]?.message ?? 'Mensagem inválida.' } }
    return estadoDeErro(e, form)
  }
  revalidatePath(`/portal/contratos/${contratoId}/chamados/${chamadoId}`)
  return {}
}
