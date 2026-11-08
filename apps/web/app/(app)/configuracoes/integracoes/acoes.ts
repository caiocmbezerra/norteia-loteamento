'use server'

import { configurarAsaas, desativarAsaas } from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

export interface EstadoAsaas extends EstadoFormulario {
  token?: string
}

export async function salvarAsaas(_: EstadoAsaas, form: FormData): Promise<EstadoAsaas> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        ambiente: z.enum(['sandbox', 'producao']),
        chave: z.string().trim().min(20, 'Cole a chave da API do Asaas.'),
      })
      .parse(valoresDoFormulario(form))
    const token = await configurarAsaas(ctx.db, ctx.tenant.id, d.ambiente, d.chave)
    revalidatePath('/configuracoes/integracoes')
    return { ok: 'Chave conferida no Asaas e guardada com segurança.', token }
  } catch (e) {
    const estado = estadoDeErro(e, form)
    // Nunca devolver a chave digitada ao navegador.
    if (estado.valores) delete estado.valores.chave
    if (estado.erro && !estado.erros)
      return { ...estado, erros: { chave: estado.erro }, erro: undefined }
    return estado
  }
}

export async function desativar(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await desativarAsaas(ctx.db, ctx.tenant.id)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/configuracoes/integracoes')
  return { ok: 'Integração desativada.' }
}
