'use server'

import { ErroAplicacao, traduzirErroBanco } from '@norteia/aplicacao'
import { lerMoeda } from '@norteia/dominio'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

/** Cadastra um custo que a loteadora desconta no distrato (documentação, taxas…). */
export async function criarItem(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        nome: z.string().trim().min(2, 'Nome: informe ao menos 2 caracteres.').max(80),
        enquadramento: z.enum(['dentro', 'fora']),
        valor: z
          .string()
          .trim()
          .transform((v, c) => {
            if (!v) return null
            try {
              return Number(lerMoeda(v))
            } catch {
              c.addIssue({ code: 'custom', message: 'Valor: use o formato 800,00.' })
              return z.NEVER
            }
          }),
      })
      .parse(valoresDoFormulario(form))
    const { error } = await ctx.db.from('itens_desconto_distrato').insert({
      tenant_id: ctx.tenant.id,
      nome: d.nome,
      dentro_do_limite: d.enquadramento === 'dentro',
      valor_padrao_centavos: d.valor,
    })
    if (error?.code === '23505')
      throw new ErroAplicacao('Já existe um item com esse nome.', 'nome', 'nome')
    if (error) throw traduzirErroBanco(error)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/configuracoes/distrato')
  return { ok: 'Item cadastrado.' }
}

export async function alternarItem(id: string, ativo: boolean) {
  const ctx = await exigirContexto()
  const { error } = await ctx.db
    .from('itens_desconto_distrato')
    .update({ ativo })
    .eq('id', id)
    .eq('tenant_id', ctx.tenant.id)
  if (error) throw traduzirErroBanco(error)
  revalidatePath('/configuracoes/distrato')
}
