'use server'

import { traduzirErroBanco } from '@norteia/aplicacao'
import { Decimal } from '@norteia/motor-financeiro'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const esquemaCorretor = z.object({
  nome: z.string().trim().min(2, 'Nome: informe ao menos 2 caracteres.'),
  creci: z.string().trim().max(30),
  imobiliaria: z.string(),
  usuario: z.string(),
  comissao: z
    .string()
    .trim()
    .regex(/^\d{1,2}(,\d{1,2})?$/, 'Comissão: use um percentual como 5 ou 4,5.')
    .transform((v) => new Decimal(v.replace(',', '.')).div(100).toNumber()),
  modo: z.enum(['ato', 'recebido']),
})

export async function novoCorretor(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const c = esquemaCorretor.parse(valoresDoFormulario(form))
    const { error } = await ctx.db.from('corretores').insert({
      tenant_id: ctx.tenant.id,
      nome: c.nome,
      creci: c.creci || null,
      imobiliaria_id: c.imobiliaria || null,
      usuario_id: c.usuario || null,
      comissao_percentual: c.comissao,
      comissao_modo: c.modo,
    })
    if (error) throw traduzirErroBanco(error)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/configuracoes/corretores')
  return { ok: 'Corretor cadastrado.' }
}

export async function novaImobiliaria(
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const i = z
      .object({
        nome: z.string().trim().min(2, 'Nome: informe ao menos 2 caracteres.'),
        cnpj: z
          .string()
          .transform((v) => v.replace(/\D/g, ''))
          .refine((v) => v === '' || v.length === 14, 'CNPJ: informe os 14 dígitos.'),
      })
      .parse(valoresDoFormulario(form))
    const { error } = await ctx.db
      .from('imobiliarias')
      .insert({ tenant_id: ctx.tenant.id, nome: i.nome, cnpj: i.cnpj || null })
    if (error) throw traduzirErroBanco(error)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/configuracoes/corretores')
  return { ok: 'Imobiliária cadastrada.' }
}
