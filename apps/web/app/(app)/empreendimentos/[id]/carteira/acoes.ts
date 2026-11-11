'use server'

import {
  type EntradaSimulacaoDistrato,
  ErroAplicacao,
  INDICES_REAJUSTE,
  type SimulacaoDistrato,
  executarDistrato,
  pagarDevolucao,
  simularDistrato,
  cederContrato,
  trocarLote,
  anteciparParcelas,
  renegociarContrato,
  cancelarCobranca,
  gerarCobranca,
  estornarRecebimento,
  gerarContrato,
  reajustarContrato,
  registrarRecebimento,
  aplicarCredito,
  cancelarCredito,
  devolverCredito,
  registrarCredito,
} from '@norteia/aplicacao'
import { lerMoeda } from '@norteia/dominio'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { Decimal } from '@norteia/motor-financeiro'

const dinheiro = (rotulo: string, minimo: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      try {
        const c = v === '' && minimo === 0 ? 0 : Number(lerMoeda(v))
        if (c < minimo) throw new Error()
        return c
      } catch {
        ctx.addIssue({ code: 'custom', message: `${rotulo}: use o formato 1.250,00.` })
        return z.NEVER
      }
    })

function revalidar(empreendimentoId: string, contratoId?: string) {
  revalidatePath(`/empreendimentos/${empreendimentoId}/carteira`)
  if (contratoId) revalidatePath(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}`)
  revalidatePath(`/empreendimentos/${empreendimentoId}/custos`)
}

export async function gerar(
  empreendimentoId: string,
  vendaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  let contratoId: string
  try {
    const indice = z
      .union([z.literal(''), z.enum(INDICES_REAJUSTE)])
      .parse(String(form.get('indice') ?? ''))
    contratoId = await gerarContrato(ctx.db, vendaId, indice || null)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?novo=1`)
}

export async function receber(
  empreendimentoId: string,
  contratoId: string,
  parcelaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const hoje = hojeSaoPaulo()
    const r = z
      .object({
        data: z.iso
          .date({ error: 'Data inválida.' })
          .refine((d) => d <= hoje, 'A data do pagamento não pode estar no futuro.'),
        valor: dinheiro('Valor', 1),
        desconto: dinheiro('Desconto', 0),
        observacao: z.string().trim().max(300),
      })
      .parse(valoresDoFormulario(form))
    await registrarRecebimento(ctx.db, parcelaId, {
      data: r.data,
      principalCentavos: r.valor,
      descontoCentavos: r.desconto,
      observacao: r.observacao || null,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?recebido=1`)
}

export async function estornar(
  empreendimentoId: string,
  contratoId: string,
  recebimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await estornarRecebimento(ctx.db, recebimentoId, String(form.get('motivo') ?? ''))
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?estornado=1`)
}

export async function reajustar(
  empreendimentoId: string,
  contratoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  let n: number
  try {
    n = await reajustarContrato(ctx.db, contratoId)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?reajustado=${n}`)
}

export async function emitirCobranca(
  empreendimentoId: string,
  contratoId: string,
  parcelaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await gerarCobranca(ctx.db, parcelaId)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?cobranca=1`)
}

export async function cancelarCobrancaAcao(
  empreendimentoId: string,
  contratoId: string,
  cobrancaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await cancelarCobranca(ctx.db, cobrancaId, String(form.get('motivo') ?? ''))
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?cobrancaCancelada=1`)
}

const juros = z
  .string()
  .trim()
  .regex(/^\d{1,2}(,\d{1,4})?$/, 'Juros: use um percentual como 1 ou 0,5.')
  .transform((v) => (Number(v.replace(',', '.')) / 100).toFixed(6))

export async function renegociar(
  empreendimentoId: string,
  contratoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const hoje = hojeSaoPaulo()
    const r = z
      .object({
        data: z.iso
          .date({ error: 'Data inválida.' })
          .refine((d) => d <= hoje, 'A data do aditivo não pode estar no futuro.'),
        motivo: z.string().trim().min(5, 'Descreva o motivo (ao menos 5 caracteres).'),
        encargos: z.string().optional(),
        desconto: dinheiro('Desconto', 0),
        parcelas: z.coerce
          .number()
          .int()
          .min(1, 'Parcelas: mínimo 1.')
          .max(480, 'Parcelas: máximo 480.'),
        juros,
        sistema: z.enum(['price', 'sac']),
        primeiraParcela: z.iso.date({ error: 'Informe a data da 1ª parcela.' }),
      })
      .refine((v) => v.primeiraParcela >= v.data, {
        message: 'A 1ª parcela não pode vencer antes do aditivo.',
        path: ['primeiraParcela'],
      })
      .parse(valoresDoFormulario(form))
    await renegociarContrato(ctx.db, contratoId, {
      data: r.data,
      motivo: r.motivo,
      incorporarEncargos: r.encargos === 'on',
      descontoCentavos: r.desconto,
      parcelas: r.parcelas,
      jurosMensal: r.juros,
      sistema: r.sistema,
      primeiraParcelaEm: r.primeiraParcela,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?renegociado=1`)
}

export async function antecipar(
  empreendimentoId: string,
  contratoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const hoje = hojeSaoPaulo()
    const data = z.iso
      .date({ error: 'Data inválida.' })
      .refine((d) => d <= hoje, 'A data do pagamento não pode estar no futuro.')
      .parse(String(form.get('data') ?? ''))
    const ids = form.getAll('parcela').map(String)
    await anteciparParcelas(ctx.db, contratoId, ids, data)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?antecipado=1`)
}

export async function ceder(
  empreendimentoId: string,
  contratoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const hoje = hojeSaoPaulo()
    const r = z
      .object({
        nome: z.string().trim().min(2, 'Nome do cessionário: ao menos 2 caracteres.'),
        cpf: z
          .string()
          .transform((v) => v.replace(/\D/g, ''))
          .refine((v) => v === '' || v.length === 11, 'CPF: informe os 11 dígitos.'),
        email: z.union([z.literal(''), z.email('E-mail inválido.')]),
        telefone: z.string().trim().max(30),
        data: z.iso
          .date({ error: 'Data inválida.' })
          .refine((d) => d <= hoje, 'A data do aditivo não pode estar no futuro.'),
        motivo: z.string().trim().min(5, 'Descreva o motivo (ao menos 5 caracteres).'),
      })
      .parse(valoresDoFormulario(form))
    const vazio = (v: string) => (v.trim() === '' ? null : v.trim())
    await cederContrato(ctx.db, ctx.tenant.id, contratoId, {
      cessionario: {
        nome: r.nome,
        cpf: vazio(r.cpf),
        email: vazio(r.email),
        telefone: vazio(r.telefone),
      },
      data: r.data,
      motivo: r.motivo,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?cedido=1`)
}

export async function trocar(
  empreendimentoId: string,
  contratoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const hoje = hojeSaoPaulo()
    const r = z
      .object({
        lote: z.uuid({ error: 'Escolha o novo lote.' }),
        preco: dinheiro('Preço', 1),
        data: z.iso
          .date({ error: 'Data inválida.' })
          .refine((d) => d <= hoje, 'A data do aditivo não pode estar no futuro.'),
        motivo: z.string().trim().min(5, 'Descreva o motivo (ao menos 5 caracteres).'),
        parcelas: z.coerce
          .number()
          .int()
          .min(1, 'Parcelas: mínimo 1.')
          .max(480, 'Parcelas: máximo 480.'),
        juros,
        sistema: z.enum(['price', 'sac']),
        primeiraParcela: z.iso.date({ error: 'Informe a data da 1ª parcela.' }),
      })
      .parse(valoresDoFormulario(form))
    await trocarLote(ctx.db, contratoId, {
      loteId: r.lote,
      precoCentavos: r.preco,
      data: r.data,
      motivo: r.motivo,
      parcelas: r.parcelas,
      jurosMensal: r.juros,
      sistema: r.sistema,
      primeiraParcelaEm: r.primeiraParcela,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  revalidatePath(`/empreendimentos/${empreendimentoId}`)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?trocado=1`)
}

export interface EstadoDistrato extends EstadoFormulario {
  simulacao?: SimulacaoDistrato
}

const pct = (rotulo: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,2}(,\d{1,4})?$/, `${rotulo}: use um percentual como 10 ou 0,75.`)
    .transform((v) => new Decimal(v.replace(',', '.')).div(100))

function lerDistrato(form: FormData): EntradaSimulacaoDistrato {
  const hoje = hojeSaoPaulo()
  const r = z
    .object({
      data: z.iso
        .date({ error: 'Data inválida.' })
        .refine((d) => d <= hoje, 'A data do distrato não pode estar no futuro.'),
      posse: z.union([z.literal(''), z.iso.date({ error: 'Data da posse inválida.' })]),
      outros: dinheiro('Outros débitos', 0),
      clausula: pct('Cláusula penal'),
      fruicao: pct('Fruição'),
      parcelas: z.coerce
        .number()
        .int()
        .min(1, 'Parcelas: mínimo 1.')
        .max(120, 'Parcelas: máximo 120.'),
      carencia: z.coerce
        .number()
        .int()
        .min(0, 'Carência: mínimo 0.')
        .max(60, 'Carência: máximo 60 meses.'),
    })
    .parse(valoresDoFormulario(form))
  // Itens de desconto do cliente: campos item_<id> com o valor deste distrato.
  const itens: { id: string; valorCentavos: number }[] = []
  for (const [k, valor] of form.entries()) {
    if (!k.startsWith('item_') || typeof valor !== 'string' || valor.trim() === '') continue
    const c = dinheiro('Valor do item', 0).safeParse(valor)
    if (!c.success)
      throw new ErroAplicacao('Valor de item de desconto: use o formato 800,00.', 'invalido')
    itens.push({ id: k.slice('item_'.length), valorCentavos: c.data })
  }
  return {
    data: r.data,
    posseDesde: r.posse || null,
    outrosDebitosCentavos: r.outros,
    itens,
    ajustes: {
      clausulaPenal: r.clausula,
      fruicaoMensal: r.fruicao,
      parcelasDevolucao: r.parcelas,
      carenciaMeses: r.carencia,
    },
  }
}

export async function simularDistratoAcao(
  _empreendimentoId: string,
  contratoId: string,
  _: EstadoDistrato,
  form: FormData,
): Promise<EstadoDistrato> {
  const ctx = await exigirContexto()
  try {
    const simulacao = await simularDistrato(ctx.db, ctx.tenant.id, contratoId, lerDistrato(form))
    return { simulacao, valores: valoresDoFormulario(form) }
  } catch (e) {
    return estadoDeErro(e, form)
  }
}

export async function executarDistratoAcao(
  empreendimentoId: string,
  contratoId: string,
  _: EstadoDistrato,
  form: FormData,
): Promise<EstadoDistrato> {
  const ctx = await exigirContexto()
  try {
    const motivo = String(form.get('motivo') ?? '').trim()
    if (motivo.length < 5)
      return {
        erros: { motivo: 'Descreva o motivo (ao menos 5 caracteres).' },
        valores: valoresDoFormulario(form),
      }
    await executarDistrato(ctx.db, ctx.tenant.id, contratoId, lerDistrato(form), motivo)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  revalidatePath(`/empreendimentos/${empreendimentoId}`)
  redirect(`/empreendimentos/${empreendimentoId}/carteira/${contratoId}?distratado=1`)
}

export async function pagarDevolucaoAcao(
  empreendimentoId: string,
  contratoId: string,
  devolucaoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await pagarDevolucao(ctx.db, devolucaoId, hojeSaoPaulo())
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  return { ok: 'Pagamento da devolução registrado.' }
}

// Crédito por pagamento a maior (D-114): registrar, aplicar em parcela, devolver ou cancelar.
export async function registrarCreditoAcao(
  empreendimentoId: string,
  contratoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const hoje = hojeSaoPaulo()
    const r = z
      .object({
        data: z.iso
          .date({ error: 'Data inválida.' })
          .refine((d) => d <= hoje, 'A data do pagamento não pode estar no futuro.'),
        valor: dinheiro('Valor', 1),
        observacao: z
          .string()
          .trim()
          .min(3, 'Explique a origem do crédito (ex.: boleto pago em dobro).')
          .max(300),
      })
      .parse(valoresDoFormulario(form))
    await registrarCredito(ctx.db, contratoId, {
      data: r.data,
      valorCentavos: r.valor,
      observacao: r.observacao,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  return { ok: 'Crédito registrado. Decida abaixo se aplica em parcela ou devolve.' }
}

export async function aplicarCreditoAcao(
  empreendimentoId: string,
  contratoId: string,
  creditoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const r = z
      .object({
        parcela: z.uuid({ error: 'Escolha a parcela.' }),
        valor: dinheiro('Valor', 1),
      })
      .parse(valoresDoFormulario(form))
    await aplicarCredito(ctx.db, creditoId, r.parcela, r.valor)
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  return { ok: 'Crédito aplicado na parcela.' }
}

export async function devolverCreditoAcao(
  empreendimentoId: string,
  contratoId: string,
  creditoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const hoje = hojeSaoPaulo()
    const r = z
      .object({
        data: z.iso
          .date({ error: 'Data inválida.' })
          .refine((d) => d <= hoje, 'A data da devolução não pode estar no futuro.'),
        valor: dinheiro('Valor', 1),
        observacao: z.string().trim().max(300),
      })
      .parse(valoresDoFormulario(form))
    await devolverCredito(ctx.db, creditoId, {
      data: r.data,
      valorCentavos: r.valor,
      observacao: r.observacao || null,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  return { ok: 'Devolução registrada.' }
}

export async function cancelarCreditoAcao(
  empreendimentoId: string,
  contratoId: string,
  creditoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await cancelarCredito(ctx.db, creditoId, String(form.get('motivo') ?? ''))
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(empreendimentoId, contratoId)
  return { ok: 'Crédito cancelado.' }
}
