'use server'

import {
  EVENTOS_CONTABEIS,
  type EventoContabil,
  type FormatoContabil,
  excluirRegraContabil,
  importarContas,
  salvarFormatoContabil,
  salvarRegraContabil,
} from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const CAMINHO = '/configuracoes/contabilidade'
const COLUNAS = [
  'data',
  'debito',
  'credito',
  'valor',
  'historico',
  'documento',
  'empreendimento',
] as const

export async function contas(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  let n: number
  try {
    n = await importarContas(ctx.db, ctx.tenant.id, String(form.get('contas') ?? ''))
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(CAMINHO)
  return { ok: `${n} conta(s) salva(s).` }
}

export async function regra(
  evento: EventoContabil,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    if (!(evento in EVENTOS_CONTABEIS)) throw new Error('evento desconhecido')
    if (form.get('remover') === '1') {
      await excluirRegraContabil(ctx.db, ctx.tenant.id, evento)
    } else {
      const d = z
        .object({
          conta_debito: z.string().min(1, 'Escolha a conta de débito.'),
          conta_credito: z.string().min(1, 'Escolha a conta de crédito.'),
          historico: z.string().trim().max(200, 'Até 200 caracteres.'),
        })
        .parse(valoresDoFormulario(form))
      await salvarRegraContabil(ctx.db, ctx.tenant.id, {
        evento,
        contaDebito: d.conta_debito,
        contaCredito: d.conta_credito,
        historico: d.historico,
      })
    }
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(CAMINHO)
  return { ok: form.get('remover') === '1' ? 'Regra removida.' : 'Regra salva.' }
}

export async function formato(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        separador: z.enum([';', ',', 'tab', '|']),
        decimal: z.enum([',', '.']),
        formato_data: z.enum(['DD/MM/AAAA', 'AAAA-MM-DD', 'DDMMAAAA']),
        colunas: z
          .string()
          .transform((v) =>
            v
              .split(',')
              .map((c) => c.trim().toLowerCase())
              .filter(Boolean),
          )
          .refine(
            (v) => v.length > 0 && v.every((c) => (COLUNAS as readonly string[]).includes(c)),
            `Use colunas entre: ${COLUNAS.join(', ')}.`,
          ),
      })
      .parse(valoresDoFormulario(form))
    await salvarFormatoContabil(ctx.db, ctx.tenant.id, {
      separador: d.separador,
      decimal: d.decimal,
      formatoData: d.formato_data,
      colunas: d.colunas as FormatoContabil['colunas'],
      cabecalho: form.get('cabecalho') === 'on',
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath(CAMINHO)
  return { ok: 'Formato salvo.' }
}
