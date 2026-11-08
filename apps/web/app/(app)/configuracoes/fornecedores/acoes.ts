'use server'

import { traduzirErroBanco } from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const esquema = z.object({
  nome: z.string().trim().min(2, 'Nome: informe ao menos 2 caracteres.').max(120),
  documento: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine(
      (v) => v === '' || v.length === 11 || v.length === 14,
      'Documento: informe 11 (CPF) ou 14 (CNPJ) dígitos.',
    ),
  email: z.union([z.literal(''), z.email('E-mail inválido.')]),
  telefone: z.string().trim().max(30),
})

export async function novoFornecedor(
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const f = esquema.parse(valoresDoFormulario(form))
    const { error } = await ctx.db.from('fornecedores').insert({
      tenant_id: ctx.tenant.id,
      nome: f.nome,
      documento: f.documento || null,
      email: f.email || null,
      telefone: f.telefone || null,
    })
    if (error) throw traduzirErroBanco(error)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/configuracoes/fornecedores')
  return { ok: 'Fornecedor cadastrado.' }
}
