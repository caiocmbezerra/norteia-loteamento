'use server'

import { decidirAprovacaoDesconto, decidirProposta, publicarTabelaPreco } from '@norteia/aplicacao'
import { lerMoeda } from '@norteia/dominio'
import { Decimal } from '@norteia/motor-financeiro'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const esquemaTabela = z.object({
  nome: z.string().trim().min(2, 'Nome: informe ao menos 2 caracteres.').max(80),
  vigenteDesde: z.iso.date({ error: 'Informe a data de início da vigência.' }),
  reajuste: z
    .string()
    .trim()
    .regex(/^-?\d{1,3}(,\d{1,4})?$/, 'Reajuste: use um percentual como 5 ou 4,5.')
    .transform((v) => new Decimal(v.replace(',', '.')).div(100).toString()),
})

/** Publica uma tabela de preços (RN-C05). Campos `preco_<lote>` substituem o reajuste. */
export async function publicarTabela(
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const t = esquemaTabela.parse(valoresDoFormulario(form))
    const precos: Record<string, number> = {}
    const erros: Record<string, string> = {}
    for (const [k, v] of form.entries()) {
      if (!k.startsWith('preco_') || typeof v !== 'string' || v.trim() === '') continue
      try {
        const c = Number(lerMoeda(v))
        if (c <= 0) throw new Error()
        precos[k.slice('preco_'.length)] = c
      } catch {
        erros[k] = 'Use o formato 90.000,00.'
      }
    }
    if (Object.keys(erros).length)
      return { erro: 'Confira os preços destacados.', erros, valores: valoresDoFormulario(form) }
    await publicarTabelaPreco(ctx.db, empreendimentoId, { ...t, precos })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}`, 'layout')
  redirect(`/empreendimentos/${empreendimentoId}/comercial/precos?publicada=1`)
}

/** Aprova ou recusa um pedido de desconto acima do limite (RN-C05). */
export async function decidirDesconto(
  empreendimentoId: string,
  aprovacaoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  const aprovar = form.get('decisao') === 'aprovar'
  const motivo = String(form.get('motivo') ?? '').trim()
  try {
    await decidirAprovacaoDesconto(ctx.db, aprovacaoId, aprovar, motivo || undefined)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}/comercial`)
  return { ok: aprovar ? 'Desconto aprovado.' : 'Desconto recusado.' }
}

/** Aceita ou recusa uma proposta; a aceita segue para o registro da venda. */
export async function decidirPropostaAcao(
  empreendimentoId: string,
  propostaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  const aceitar = form.get('decisao') === 'aprovar'
  const motivo = String(form.get('motivo') ?? '').trim()
  try {
    await decidirProposta(ctx.db, propostaId, aceitar, motivo || undefined)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}`, 'layout')
  return {
    ok: aceitar ? 'Proposta aceita. Registre a venda pelo link da proposta.' : 'Proposta recusada.',
  }
}
