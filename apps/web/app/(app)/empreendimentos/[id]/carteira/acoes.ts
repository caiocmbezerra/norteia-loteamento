'use server'

import {
  INDICES_REAJUSTE,
  anteciparParcelas,
  renegociarContrato,
  cancelarCobranca,
  gerarCobranca,
  estornarRecebimento,
  gerarContrato,
  reajustarContrato,
  registrarRecebimento,
} from '@norteia/aplicacao'
import { lerMoeda } from '@norteia/dominio'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

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
