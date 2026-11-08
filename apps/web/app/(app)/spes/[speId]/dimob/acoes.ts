'use server'

import {
  informarCpfComprador,
  salvarDadosFiscaisEmpreendimento,
  salvarDadosFiscaisSpe,
} from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const opcional = z
  .string()
  .trim()
  .transform((v) => v || null)
const municipio = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}$/.test(v), 'Código da Receita: 4 dígitos.')
  .transform((v) => v || null)

export async function dadosSpe(
  speId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        cnpj: opcional,
        endereco: opcional,
        uf: opcional,
        municipio_rfb: municipio,
        cpf_responsavel: opcional,
      })
      .parse(valoresDoFormulario(form))
    await salvarDadosFiscaisSpe(ctx.db, speId, {
      cnpj: d.cnpj,
      endereco: d.endereco,
      uf: d.uf,
      municipioRfb: d.municipio_rfb,
      cpfResponsavel: d.cpf_responsavel,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/spes/${speId}/dimob`)
  return { ok: 'Dados da SPE salvos.' }
}

export async function dadosEmpreendimento(
  speId: string,
  empreendimentoId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        endereco: opcional,
        cep: z
          .string()
          .transform((v) => v.replace(/\D/g, ''))
          .refine((v) => v === '' || v.length === 8, 'CEP: 8 dígitos.')
          .transform((v) => v || null),
        municipio_rfb: municipio,
        tipo_imovel: z.enum(['U', 'R']),
      })
      .parse(valoresDoFormulario(form))
    await salvarDadosFiscaisEmpreendimento(ctx.db, empreendimentoId, {
      endereco: d.endereco,
      cep: d.cep,
      municipioRfb: d.municipio_rfb,
      tipoImovel: d.tipo_imovel,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/spes/${speId}/dimob`)
  return { ok: 'Dados do empreendimento salvos.' }
}

export async function cpfComprador(
  speId: string,
  compradorId: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    await informarCpfComprador(ctx.db, compradorId, String(form.get('cpf') ?? ''))
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(`/spes/${speId}/dimob`)
  return { ok: 'CPF salvo.' }
}
