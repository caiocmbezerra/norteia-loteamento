'use server'

import { ErroAplicacao, traduzirErroBanco } from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const cnpj = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v === '' || v.length === 14, 'CNPJ: informe os 14 dígitos.')

const esquema = z.object({
  tipo: z.enum(['empresa', 'spe']),
  empresa: z.string(),
  razaoSocial: z.string().trim().min(2, 'Razão social: informe ao menos 2 caracteres.'),
  cnpj,
})

export async function adicionarEstrutura(
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = esquema.parse(valoresDoFormulario(form))
    if (d.tipo === 'spe') {
      const [{ count }, { data: liberado }] = await Promise.all([
        ctx.db
          .from('spes')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenant.id),
        ctx.db
          .from('plano_funcionalidades')
          .select('funcionalidade')
          .eq('plano_id', ctx.tenant.plano)
          .eq('funcionalidade', 'multi_spe')
          .maybeSingle(),
      ])
      if ((count ?? 0) >= 1 && !liberado) {
        throw new ErroAplicacao(
          'Mais de uma SPE está disponível a partir do plano Profissional (RN-G07).',
          'plano',
        )
      }
    }
    const { error } =
      d.tipo === 'empresa'
        ? await ctx.db
            .from('empresas')
            .insert({ tenant_id: ctx.tenant.id, razao_social: d.razaoSocial, cnpj: d.cnpj || null })
        : await ctx.db.from('spes').insert({
            tenant_id: ctx.tenant.id,
            empresa_id: d.empresa,
            razao_social: d.razaoSocial,
            cnpj: d.cnpj || null,
          })
    if (error) {
      if (error.code === '23514')
        throw new ErroAplicacao('CNPJ inválido: confira os dígitos.', 'cnpj', 'cnpj')
      throw traduzirErroBanco(error)
    }
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/configuracoes/empresas')
  return { ok: 'Cadastro salvo.' }
}
