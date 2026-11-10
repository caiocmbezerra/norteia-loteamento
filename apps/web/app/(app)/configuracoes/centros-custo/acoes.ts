'use server'

import { ErroAplicacao, traduzirErroBanco } from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

/** Código a partir do nome: minúsculas sem acento, só letras e sublinhado. */
function codigoDe(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}

/** Cria um centro de custo próprio (ou subcentro de um existente). */
export async function criarCentro(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        nome: z.string().trim().min(2, 'Nome: informe ao menos 2 caracteres.').max(80),
        pai: z.string(),
      })
      .parse(valoresDoFormulario(form))
    const base = codigoDe(d.nome)
    if (!base) throw new ErroAplicacao('Use letras no nome do centro.', 'nome', 'nome')
    const codigo = d.pai ? `${d.pai}.${base}` : base
    let ordem = 95
    if (d.pai) {
      const { data: irmaos } = await ctx.db
        .from('centros_custo')
        .select('ordem')
        .eq('tenant_id', ctx.tenant.id)
        .or(`codigo.eq.${d.pai},codigo.like.${d.pai}.*`)
      ordem = Math.min(32767, Math.max(...(irmaos ?? []).map((i) => i.ordem), 0) + 1)
    }
    const { error } = await ctx.db
      .from('centros_custo')
      .insert({ tenant_id: ctx.tenant.id, codigo, nome: d.nome, ordem })
    if (error?.code === '23505')
      throw new ErroAplicacao('Já existe um centro com esse nome aqui.', 'nome', 'nome')
    if (error) throw traduzirErroBanco(error)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/configuracoes/centros-custo')
  return { ok: 'Centro de custo criado.' }
}

/** Ativa ou desativa um centro (desativado some das listas de lançamento; o histórico fica). */
export async function alternarCentro(codigo: string, ativo: boolean) {
  const ctx = await exigirContexto()
  const { error } = await ctx.db
    .from('centros_custo')
    .update({ ativo })
    .eq('tenant_id', ctx.tenant.id)
    .eq('codigo', codigo)
  if (error) throw traduzirErroBanco(error)
  revalidatePath('/configuracoes/centros-custo')
}
