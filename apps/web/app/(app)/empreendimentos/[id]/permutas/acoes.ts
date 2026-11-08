'use server'

import { criarPermuta, estornarRepasse, registrarRepasse } from '@norteia/aplicacao'
import { lerMoeda } from '@norteia/dominio'
import { Decimal } from '@norteia/motor-financeiro'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

const reais = (rotulo: string, minimo: number) =>
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

const permutante = {
  nome: z.string().trim().min(2, 'Nome do permutante: ao menos 2 caracteres.'),
  documento: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .refine((v) => v === '' || v.length === 11 || v.length === 14, 'CPF/CNPJ: 11 ou 14 dígitos.'),
  inicio: z.iso.date({ error: 'Data inválida.' }),
}

function caminho(id: string) {
  revalidatePath(`/empreendimentos/${id}/permutas`)
  revalidatePath(`/empreendimentos/${id}/custos`)
  revalidatePath(`/empreendimentos/${id}`)
}

export async function novaFisica(
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({ ...permutante, valor: reais('Valor econômico', 0) })
      .parse(valoresDoFormulario(form))
    const lotes = form.getAll('lote').map(String)
    if (lotes.length === 0)
      return { erros: { lote: 'Escolha os lotes entregues.' }, valores: valoresDoFormulario(form) }
    await criarPermuta(
      ctx.db,
      ctx.tenant.id,
      empreendimentoId,
      { nome: d.nome, documento: d.documento || null, email: null, telefone: null },
      { tipo: 'fisica', inicio: d.inicio, lotes, valorEconomicoCentavos: d.valor || null },
    )
  } catch (e) {
    return estadoDeErro(e, form)
  }
  caminho(empreendimentoId)
  return { ok: 'Permuta física registrada: os lotes saíram do estoque.' }
}

export async function novaFinanceira(
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        ...permutante,
        percentual: z
          .string()
          .trim()
          .regex(/^\d{1,2}(,\d{1,4})?$/, 'Percentual: use um número como 12 ou 7,5.')
          .transform((v) => new Decimal(v.replace(',', '.')).div(100).toString()),
        base: z.enum(['recebido', 'principal', 'vgv']),
        abate: z.string().optional(),
      })
      .parse(valoresDoFormulario(form))
    await criarPermuta(
      ctx.db,
      ctx.tenant.id,
      empreendimentoId,
      { nome: d.nome, documento: d.documento || null, email: null, telefone: null },
      {
        tipo: 'financeira',
        inicio: d.inicio,
        percentual: d.percentual,
        base: d.base,
        abateDistrato: d.abate === 'on',
      },
    )
  } catch (e) {
    return estadoDeErro(e, form)
  }
  caminho(empreendimentoId)
  return { ok: 'Permuta financeira registrada.' }
}

export async function repassar(
  empreendimentoId: string,
  permutaId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const hoje = hojeSaoPaulo()
    const d = z
      .object({
        data: z.iso
          .date({ error: 'Data inválida.' })
          .refine((x) => x <= hoje, 'A data não pode estar no futuro.'),
        valor: reais('Valor', 1),
        observacao: z.string().trim().max(200),
      })
      .parse(valoresDoFormulario(form))
    await registrarRepasse(ctx.db, permutaId, {
      data: d.data,
      valorCentavos: d.valor,
      observacao: d.observacao || null,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  caminho(empreendimentoId)
  return { ok: 'Repasse registrado.' }
}

export async function estornar(
  empreendimentoId: string,
  repasseId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await estornarRepasse(ctx.db, repasseId, String(form.get('motivo') ?? ''))
  } catch (e) {
    return estadoDeErro(e, form)
  }
  caminho(empreendimentoId)
  return { ok: 'Repasse estornado.' }
}
