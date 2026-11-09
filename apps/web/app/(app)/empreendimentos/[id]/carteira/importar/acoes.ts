'use server'

import {
  type MapeamentoSalvo,
  ErroAplicacao,
  importarCarteira,
  salvarMapeamento,
} from '@norteia/aplicacao'
import type { ContratoImportado } from '@norteia/integracoes/importacao'
import { revalidatePath } from 'next/cache'
import { exigirContexto } from '@/lib/contexto'

export async function importar(
  empreendimentoId: string,
  d: {
    origem: string
    arquivo: string | null
    saldoOrigemCentavos: number
    contratos: ContratoImportado[]
    mapeamento: MapeamentoSalvo
  },
): Promise<{ erro?: string; ok?: string }> {
  const ctx = await exigirContexto()
  if (d.origem.trim().length < 2) return { erro: 'Informe o sistema de origem.' }
  try {
    await salvarMapeamento(ctx.db, ctx.tenant.id, d.mapeamento)
    await importarCarteira(ctx.db, empreendimentoId, d)
  } catch (e) {
    if (e instanceof ErroAplicacao) return { erro: e.message }
    throw e
  }
  revalidatePath(`/empreendimentos/${empreendimentoId}`, 'layout')
  return { ok: `${d.contratos.length} contrato(s) importado(s).` }
}
