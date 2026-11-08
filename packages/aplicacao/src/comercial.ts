import type { ClienteBanco } from '@norteia/db'
import type { VendaReal } from '@norteia/projecao'
import { type IndiceReajuste, gerarContrato, paginar, parcelasPorVenda } from './carteira'
import { ErroAplicacao, traduzirErroBanco } from './erros'

function falhar(error: { code?: string; message: string; hint?: string | null } | null) {
  if (error) throw traduzirErroBanco(error)
}

export async function reservarLote(
  db: ClienteBanco,
  loteId: string,
  clienteNome: string,
  corretorId?: string | null,
  horas?: number,
): Promise<string> {
  const { data, error } = await db.rpc('reservar_lote', {
    p_lote: loteId,
    p_cliente_nome: clienteNome,
    ...(corretorId ? { p_corretor: corretorId } : {}),
    ...(horas ? { p_horas: horas } : {}),
  })
  falhar(error)
  return data!
}

export async function cancelarReserva(db: ClienteBanco, reservaId: string, motivo: string) {
  const { error } = await db.rpc('cancelar_reserva', { p_reserva: reservaId, p_motivo: motivo })
  falhar(error)
}

export interface DadosVenda {
  comprador: { nome: string; cpf: string | null; email: string | null; telefone: string | null }
  corretorId: string | null
  dataVenda: string
  precoCentavos: number
  entradaCentavos: number
  parcelas: number
  jurosMensal: string
  sistema: 'price' | 'sac'
  primeiraParcelaEm: string | null
  /** Índice de reajuste do contrato (RN-K03); nulo = sem reajuste. */
  indiceReajuste: IndiceReajuste | null
}

/**
 * Cadastra (ou reaproveita pelo CPF) o comprador, registra a venda pela função do banco e gera
 * o contrato com as parcelas do motor. Se o contrato falhar, a venda fica registrada e o
 * contrato pode ser gerado depois pela carteira.
 */
export async function registrarVenda(
  db: ClienteBanco,
  tenantId: string,
  loteId: string,
  d: DadosVenda,
  justificativa?: string,
): Promise<{ vendaId: string; contratoId: string | null }> {
  let compradorId: string | null = null
  if (d.comprador.cpf) {
    const { data, error } = await db
      .from('compradores')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('cpf', d.comprador.cpf)
      .maybeSingle()
    falhar(error)
    compradorId = data?.id ?? null
  }
  if (!compradorId) {
    const { data, error } = await db
      .from('compradores')
      .insert({ tenant_id: tenantId, ...d.comprador })
      .select('id')
      .single()
    if (error?.code === '23514')
      throw new ErroAplicacao('CPF inválido: confira os dígitos.', 'cpf', 'cpf')
    falhar(error)
    compradorId = data!.id
  }

  let comissao = { percentual: 0, modo: 'ato' }
  if (d.corretorId) {
    const { data, error } = await db
      .from('corretores')
      .select('comissao_percentual, comissao_modo')
      .eq('id', d.corretorId)
      .single()
    falhar(error)
    comissao = { percentual: Number(data!.comissao_percentual), modo: data!.comissao_modo }
  }

  const { data, error } = await db.rpc('vender_lote', {
    p_lote: loteId,
    p_venda: {
      comprador_id: compradorId,
      corretor_id: d.corretorId,
      data_venda: d.dataVenda,
      preco_centavos: d.precoCentavos,
      entrada_centavos: d.entradaCentavos,
      parcelas: d.parcelas,
      juros_mensal: d.jurosMensal,
      sistema: d.sistema,
      primeira_parcela_em: d.primeiraParcelaEm,
      comissao_percentual: comissao.percentual,
      comissao_modo: comissao.modo,
    },
    ...(justificativa ? { p_justificativa: justificativa } : {}),
  })
  falhar(error)
  const vendaId = data!
  const contratoId = await gerarContrato(db, vendaId, d.indiceReajuste).catch(() => null)
  return { vendaId, contratoId }
}

/** Vendas ativas do empreendimento no formato da projeção, com as parcelas dos contratos. */
export async function vendasDoEmpreendimento(
  db: ClienteBanco,
  empreendimentoId: string,
): Promise<VendaReal[]> {
  const [data, contratos] = await Promise.all([
    paginar((de, ate) =>
      db
        .from('vendas')
        .select(
          'id, data_venda, preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema, primeira_parcela_em, comissao_percentual, comissao_modo',
        )
        .eq('empreendimento_id', empreendimentoId)
        .eq('situacao', 'ativa')
        .order('id')
        .range(de, ate),
    ),
    parcelasPorVenda(db, empreendimentoId),
  ])
  return data.map((v) => ({
    dataVenda: v.data_venda,
    precoCentavos: v.preco_centavos,
    entradaCentavos: v.entrada_centavos,
    parcelas: v.parcelas,
    jurosMensal: String(v.juros_mensal),
    sistema: v.sistema as 'price' | 'sac',
    primeiraParcelaEm: v.primeira_parcela_em,
    comissaoPercentual: String(v.comissao_percentual),
    comissaoModo: v.comissao_modo as 'ato' | 'recebido',
    ...(contratos.has(v.id) ? { contrato: contratos.get(v.id)! } : {}),
  }))
}
