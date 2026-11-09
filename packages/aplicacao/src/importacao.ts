import type { ClienteBanco } from '@norteia/db'
import type { CampoCarteira, ContratoImportado } from '@norteia/integracoes/importacao'
import { traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

/** Mapeamento salvo: campo → nome da coluna na planilha de origem (vale para o próximo arquivo). */
export type MapeamentoSalvo = Partial<Record<CampoCarteira, string>>

export async function carregarMapeamento(
  db: ClienteBanco,
  tenantId: string,
): Promise<MapeamentoSalvo | null> {
  const { data, error } = await db
    .from('mapeamentos_importacao')
    .select('colunas')
    .eq('tenant_id', tenantId)
    .eq('nome', 'carteira')
    .maybeSingle()
  falhar(error)
  return (data?.colunas as MapeamentoSalvo | undefined) ?? null
}

export async function salvarMapeamento(db: ClienteBanco, tenantId: string, m: MapeamentoSalvo) {
  const { error } = await db
    .from('mapeamentos_importacao')
    .upsert({ tenant_id: tenantId, nome: 'carteira', colunas: m })
  falhar(error)
}

/** Grava a carteira (tudo ou nada); o banco confere lotes e a conciliação do saldo. */
export async function importarCarteira(
  db: ClienteBanco,
  empreendimentoId: string,
  d: {
    origem: string
    arquivo: string | null
    saldoOrigemCentavos: number
    contratos: ContratoImportado[]
  },
): Promise<string> {
  const { data, error } = await db.rpc('importar_carteira', {
    p_empreendimento: empreendimentoId,
    p_origem: d.origem,
    p_arquivo: d.arquivo ?? '',
    p_saldo_origem: d.saldoOrigemCentavos,
    p_contratos: d.contratos as never,
  })
  falhar(error)
  return data!
}

export async function listarImportacoes(db: ClienteBanco, empreendimentoId: string) {
  const { data, error } = await db
    .from('importacoes')
    .select(
      'id, origem, arquivo, contratos, parcelas, saldo_aberto_centavos, saldo_origem_centavos, criado_em',
    )
    .eq('empreendimento_id', empreendimentoId)
    .order('criado_em', { ascending: false })
  falhar(error)
  return data ?? []
}
