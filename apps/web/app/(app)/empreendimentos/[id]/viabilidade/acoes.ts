'use server'

import {
  ErroAplicacao,
  aprovarViabilidade,
  criarViabilidade,
  premissasSugeridas,
  salvarViabilidade,
} from '@norteia/aplicacao'
import {
  esquemaFormularioViabilidade,
  formularioParaPremissas,
  lerFormularioViabilidade,
} from '@norteia/dominio'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

export async function novoEstudo(empreendimentoId: string) {
  const ctx = await exigirContexto()
  const { data: lotes } = await ctx.db
    .from('lotes')
    .select('status, preco_base_centavos')
    .eq('empreendimento_id', empreendimentoId)
  const { count } = await ctx.db
    .from('viabilidades')
    .select('id', { count: 'exact', head: true })
    .eq('empreendimento_id', empreendimentoId)
  const id = await criarViabilidade(
    ctx.db,
    ctx.tenant.id,
    empreendimentoId,
    `Estudo ${(count ?? 0) + 1}`,
    premissasSugeridas(lotes ?? []),
    '0.012',
  )
  redirect(`/empreendimentos/${empreendimentoId}/viabilidade/${id}?editar=1`)
}

export async function salvarEstudo(
  empreendimentoId: string,
  id: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const f = esquemaFormularioViabilidade.parse(
      lerFormularioViabilidade(valoresDoFormulario(form)),
    )
    const { premissas, tmaMensal } = formularioParaPremissas(f)
    await salvarViabilidade(ctx.db, id, f.nome, premissas, tmaMensal)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}/viabilidade/${id}`)
  redirect(`/empreendimentos/${empreendimentoId}/viabilidade/${id}`)
}

export async function aprovarEstudo(
  empreendimentoId: string,
  id: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  let versao: number
  try {
    const motivo = String(form.get('motivo') ?? '').trim()
    versao = await aprovarViabilidade(ctx.db, id, motivo || undefined)
  } catch (e) {
    if (e instanceof ErroAplicacao && e.message.includes('motivo')) {
      return { erros: { motivo: e.message }, valores: valoresDoFormulario(form) }
    }
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}/viabilidade`)
  redirect(`/empreendimentos/${empreendimentoId}/viabilidade?aprovado=${versao}`)
}
