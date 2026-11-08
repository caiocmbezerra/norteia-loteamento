'use server'

import {
  TIPOS_MOVIMENTO,
  cadastrarSocio,
  definirParticipacao,
  estornarMovimentoSocio,
  registrarMovimentoSocio,
} from '@norteia/aplicacao'
import { lerMoeda } from '@norteia/dominio'
import { Decimal } from '@norteia/motor-financeiro'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

const revalidar = (speId: string) => revalidatePath(`/spes/${speId}`)

export async function novoSocio(
  speId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        nome: z.string().trim().min(2, 'Nome: ao menos 2 caracteres.'),
        documento: z
          .string()
          .transform((v) => v.replace(/\D/g, ''))
          .refine(
            (v) => v === '' || v.length === 11 || v.length === 14,
            'CPF/CNPJ: 11 ou 14 dígitos.',
          ),
        email: z.union([z.literal(''), z.email('E-mail inválido.')]),
      })
      .parse(valoresDoFormulario(form))
    await cadastrarSocio(ctx.db, ctx.tenant.id, {
      nome: d.nome,
      documento: d.documento || null,
      email: d.email || null,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(speId)
  return { ok: 'Sócio cadastrado. Defina a participação dele abaixo.' }
}

export async function participacao(
  speId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        socio: z.uuid({ error: 'Escolha o sócio.' }),
        percentual: z
          .string()
          .trim()
          .regex(/^\d{1,3}(,\d{1,4})?$/, 'Percentual: use um número como 40 ou 33,3333.')
          .transform((v) => new Decimal(v.replace(',', '.')).div(100))
          .refine((v) => v.gte(0) && v.lte(1), 'Percentual entre 0 e 100.'),
        inicio: z.iso.date({ error: 'Data inválida.' }),
        motivo: z.string().trim().min(3, 'Informe o motivo (ex.: alteração contratual).'),
      })
      .parse(valoresDoFormulario(form))
    await definirParticipacao(ctx.db, speId, {
      socioId: d.socio,
      percentual: d.percentual.toString(),
      inicio: d.inicio,
      motivo: d.motivo,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(speId)
  return { ok: 'Participação registrada a partir da data informada.' }
}

export async function movimento(
  speId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const hoje = hojeSaoPaulo()
    const d = z
      .object({
        socio: z.uuid({ error: 'Escolha o sócio.' }),
        tipo: z.enum(TIPOS_MOVIMENTO),
        data: z.iso
          .date({ error: 'Data inválida.' })
          .refine((x) => x <= hoje, 'A data não pode estar no futuro.'),
        valor: z
          .string()
          .trim()
          .transform((v, c) => {
            try {
              const n = Number(lerMoeda(v))
              if (n <= 0) throw new Error()
              return n
            } catch {
              c.addIssue({ code: 'custom', message: 'Valor: use o formato 100.000,00.' })
              return z.NEVER
            }
          }),
        observacao: z.string().trim().max(200),
      })
      .parse(valoresDoFormulario(form))
    await registrarMovimentoSocio(ctx.db, speId, {
      socioId: d.socio,
      tipo: d.tipo,
      data: d.data,
      valorCentavos: d.valor,
      observacao: d.observacao || null,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(speId)
  return { ok: 'Movimento registrado.' }
}

export async function estornar(
  speId: string,
  movimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await estornarMovimentoSocio(ctx.db, movimentoId, String(form.get('motivo') ?? ''))
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidar(speId)
  return { ok: 'Movimento estornado.' }
}
