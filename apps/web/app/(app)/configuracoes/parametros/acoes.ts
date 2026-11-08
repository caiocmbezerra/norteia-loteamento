'use server'

import { definirParametro } from '@norteia/aplicacao'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type EstadoFormulario, estadoDeErro, valoresDoFormulario } from '@/lib/acao'
import { exigirContexto } from '@/lib/contexto'

export async function salvarParametro(
  chave: string,
  _: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const ctx = await exigirContexto()
  try {
    const d = z
      .object({
        escopo: z
          .string()
          .regex(/^(tenant|(empresa|spe|empreendimento):[0-9a-f-]{36})$/, 'Escolha onde vale.'),
        valor: z.string().trim().min(1, 'Informe o valor.'),
        inicio: z.iso.date({ error: 'Informe a data de início.' }),
        motivo: z
          .string()
          .trim()
          .min(3, 'Informe o motivo (por exemplo, "orientação do advogado").'),
      })
      .parse(valoresDoFormulario(form))
    const [escopo, escopoId] = d.escopo.split(':') as [
      'tenant' | 'empresa' | 'spe' | 'empreendimento',
      string | undefined,
    ]
    await definirParametro(ctx.db, ctx.tenant.id, {
      chave,
      texto: d.valor,
      inicio: d.inicio,
      motivo: d.motivo,
      escopo,
      escopoId: escopoId ?? null,
    })
  } catch (e) {
    return estadoDeErro(e, form)
  }
  revalidatePath('/configuracoes/parametros')
  return { ok: 'Parâmetro salvo. Vale a partir da data informada.' }
}
