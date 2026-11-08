'use server'

import {
  INDICES_REAJUSTE,
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
