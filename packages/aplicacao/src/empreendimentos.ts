import type { ClienteBanco } from '@norteia/db'
import { type CadastroInicial, type NovoEmpreendimento, gerarGrade } from '@norteia/dominio'
import { ErroAplicacao, traduzirErroBanco } from './erros'

/** Primeira SPE do tenant (o pequeno loteador tem só a SPE criada no cadastro). */
async function speDoTenant(db: ClienteBanco, tenantId: string, speId?: string): Promise<string> {
  if (speId) return speId
  const { data, error } = await db
    .from('spes')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('criado_em')
    .limit(1)
    .maybeSingle()
  if (error) throw traduzirErroBanco(error)
  if (!data) throw new ErroAplicacao('Cadastre uma SPE antes de criar o empreendimento.', 'sem_spe')
  return data.id
}

/** Cria o empreendimento com a grade de quadras e lotes, numa única transação. */
export async function criarEmpreendimento(
  db: ClienteBanco,
  tenantId: string,
  dados: NovoEmpreendimento,
  speId?: string,
): Promise<string> {
  const lotes = gerarGrade({
    quadras: dados.quadras,
    lotesPorQuadra: dados.lotesPorQuadra,
    areaM2: dados.areaPadrao,
    precoBaseCentavos: dados.precoPadrao,
  })
  const { data, error } = await db.rpc('criar_empreendimento_com_lotes', {
    p_tenant: tenantId,
    p_spe: await speDoTenant(db, tenantId, speId),
    p_nome: dados.nomeEmpreendimento,
    p_municipio: dados.municipio,
    p_uf: dados.uf,
    p_data_base: dados.mesBase,
    p_lotes: lotes.map((l) => ({
      quadra: l.quadra,
      numero: l.numero,
      area_m2: l.areaM2,
      preco_base_centavos: l.precoBaseCentavos,
    })),
  })
  if (error) throw traduzirErroBanco(error)
  return data
}

/**
 * Cadastro inicial do pequeno loteador (RN-G02): cria o cliente (com empresa e SPE)
 * e o primeiro empreendimento com seus lotes.
 */
export async function realizarCadastroInicial(
  db: ClienteBanco,
  dados: CadastroInicial,
): Promise<{ tenantId: string; empreendimentoId: string }> {
  const { data: tenantId, error } = await db.rpc('criar_tenant', { p_nome: dados.nomeLoteadora })
  if (error) throw traduzirErroBanco(error)
  const empreendimentoId = await criarEmpreendimento(db, tenantId, dados)
  return { tenantId, empreendimentoId }
}
