'use server'

import {
  ErroAplicacao,
  decidirAprovacaoDesconto,
  decidirProposta,
  publicarTabelaPreco,
  traduzirErroBanco,
} from '@norteia/aplicacao'
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

const ORIGENS = [
  'site',
  'indicacao',
  'placa',
  'redes_sociais',
  'imobiliaria',
  'evento',
  'outro',
] as const
const SITUACOES_LEAD = ['novo', 'em_contato', 'visita', 'proposta', 'ganho', 'perdido'] as const
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)

/** Cadastra um interessado; o corretor cadastra sempre em seu nome (o banco garante). */
export async function cadastrarLead(
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        nome: z.string().trim().min(2, 'Nome: informe ao menos 2 caracteres.').max(200),
        telefone: textoOpcional(30),
        email: z.union([z.literal(''), z.email('E-mail inválido.')]).transform((v) => v || null),
        origem: z.enum(ORIGENS),
        corretor: z.string().transform((v) => v || null),
        observacao: textoOpcional(1000),
      })
      .parse(valoresDoFormulario(form))
    const { error } = await ctx.db.from('leads').insert({
      tenant_id: ctx.tenant.id,
      empreendimento_id: empreendimentoId,
      nome: d.nome,
      telefone: d.telefone,
      email: d.email,
      origem: d.origem,
      corretor_id: d.corretor,
      observacao: d.observacao,
    })
    if (error) throw traduzirErroBanco(error)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}/comercial/leads`)
  return { ok: 'Lead cadastrado.' }
}

/** Avança o lead no funil (perdido exige motivo). */
export async function atualizarLead(
  empreendimentoId: string,
  leadId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        situacao: z.enum(SITUACOES_LEAD),
        proximoContato: z.union([z.literal(''), z.iso.date()]).transform((v) => v || null),
        motivoPerda: textoOpcional(500),
      })
      .refine((v) => v.situacao !== 'perdido' || (v.motivoPerda?.length ?? 0) >= 3, {
        message: 'Informe o motivo da perda.',
        path: ['motivoPerda'],
      })
      // Só um dos dois campos aparece, conforme a etapa.
      .parse({ proximoContato: '', motivoPerda: '', ...valoresDoFormulario(form) })
    const { data, error } = await ctx.db
      .from('leads')
      .update({
        situacao: d.situacao,
        proximo_contato: d.proximoContato,
        motivo_perda: d.situacao === 'perdido' ? d.motivoPerda : null,
      })
      .eq('id', leadId)
      .select('id')
    if (error) throw traduzirErroBanco(error)
    if (!data?.length) throw new ErroAplicacao('Você não tem permissão para alterar este lead.')
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}/comercial/leads`)
  return { ok: 'Lead atualizado.' }
}

/** Define (ou troca) a meta do mês do empreendimento ou de um corretor. */
export async function definirMeta(
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        mes: z.string().regex(/^\d{4}-\d{2}$/, 'Informe o mês.'),
        corretor: z.string().transform((v) => v || null),
        vendas: z.coerce.number().int().min(0, 'Vendas: mínimo 0.').max(10000),
        vgv: z
          .string()
          .trim()
          .transform((v, c) => {
            try {
              return Number(lerMoeda(v || '0'))
            } catch {
              c.addIssue({ code: 'custom', message: 'VGV: use o formato 900.000,00.' })
              return z.NEVER
            }
          }),
      })
      .parse(valoresDoFormulario(form))
    const mes = `${d.mes}-01`
    let consulta = ctx.db
      .from('metas_comerciais')
      .select('id')
      .eq('empreendimento_id', empreendimentoId)
      .eq('mes', mes)
    consulta = d.corretor
      ? consulta.eq('corretor_id', d.corretor)
      : consulta.is('corretor_id', null)
    const { data: existente, error: erroLer } = await consulta.maybeSingle()
    if (erroLer) throw traduzirErroBanco(erroLer)
    const { error } = existente
      ? await ctx.db
          .from('metas_comerciais')
          .update({ vendas: d.vendas, vgv_centavos: d.vgv })
          .eq('id', existente.id)
      : await ctx.db.from('metas_comerciais').insert({
          tenant_id: ctx.tenant.id,
          empreendimento_id: empreendimentoId,
          corretor_id: d.corretor,
          mes,
          vendas: d.vendas,
          vgv_centavos: d.vgv,
        })
    if (error) throw traduzirErroBanco(error)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}/comercial`)
  return { ok: 'Meta salva.' }
}

/** Publica, despublica e configura a vitrine pública do empreendimento (D-118). */
export async function configurarVitrine(
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        publicada: z.string().transform((v) => v === 'sim'),
        precos: z.enum(['lote', 'a_partir', 'nenhum'], { error: 'Escolha como mostrar o preço.' }),
        descricao: z.string().trim().max(1000, 'Descrição: no máximo 1.000 caracteres.'),
      })
      .parse(valoresDoFormulario(form))
    const { error } = await ctx.db.rpc('configurar_vitrine', {
      p_empreendimento: empreendimentoId,
      p_publicada: d.publicada,
      p_precos: d.precos,
      p_descricao: d.descricao,
    })
    if (error) throw traduzirErroBanco(error)
    revalidatePath(`/empreendimentos/${empreendimentoId}/comercial`)
    return { ok: d.publicada ? 'Vitrine publicada.' : 'Vitrine salva (não publicada).' }
  } catch (e) {
    return estadoDeErro(e, form)
  }
}
