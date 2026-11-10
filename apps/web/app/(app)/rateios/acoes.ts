'use server'

import { ErroAplicacao, ratearDespesa } from '@norteia/aplicacao'
import { lerMoeda } from '@norteia/dominio'
import { Decimal } from '@norteia/motor-financeiro'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

const esquema = z.object({
  descricao: z.string().trim().min(2, 'Descrição: informe ao menos 2 caracteres.').max(200),
  centro: z.string().min(1, 'Escolha o centro de custo.'),
  fornecedorId: z.string(),
  valor: z
    .string()
    .trim()
    .transform((v, c) => {
      try {
        const n = Number(lerMoeda(v))
        if (n <= 0) throw new Error()
        return n
      } catch {
        c.addIssue({ code: 'custom', message: 'Valor: use o formato 3.000,00.' })
        return z.NEVER
      }
    }),
  vencimento: z.iso.date({ error: 'Vencimento inválido.' }),
  documentoNumero: z.string().trim().max(60),
  criterio: z.enum(['lotes', 'area', 'vgv', 'manual']),
})

/** Rateia a despesa entre os empreendimentos marcados (`emp`), com `pct_<id>` no critério manual. */
export async function ratear(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const r = esquema.parse(valoresDoFormulario(form))
    const empreendimentos = form.getAll('emp').map(String)
    if (empreendimentos.length < 2)
      throw new ErroAplicacao(
        'Marque ao menos dois empreendimentos.',
        'empreendimentos',
        'empreendimentos',
      )
    let percentuais: Record<string, string> | undefined
    if (r.criterio === 'manual') {
      percentuais = {}
      for (const id of empreendimentos) {
        const t = String(form.get(`pct_${id}`) ?? '').trim()
        if (!/^\d{1,3}(,\d{1,4})?$/.test(t))
          throw new ErroAplicacao(
            'Informe o percentual de cada empreendimento marcado (ex.: 25 ou 33,3333).',
            'criterio',
            'criterio',
          )
        percentuais[id] = new Decimal(t.replace(',', '.')).div(100).toString()
      }
    }
    await ratearDespesa(ctx.db, {
      descricao: r.descricao,
      centro: r.centro,
      fornecedorId: r.fornecedorId || null,
      valorCentavos: r.valor,
      vencimento: r.vencimento,
      documentoNumero: r.documentoNumero || null,
      criterio: r.criterio,
      empreendimentos,
      ...(percentuais ? { percentuais } : {}),
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/rateios')
  revalidatePath('/empreendimentos', 'layout')
  return { ok: 'Despesa rateada: cada empreendimento recebeu a sua conta a pagar.' }
}
