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

export interface DadosComprador {
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
}

/** Reaproveita o comprador pelo CPF ou cadastra um novo. */
export async function obterComprador(
  db: ClienteBanco,
  tenantId: string,
  comprador: DadosComprador,
): Promise<string> {
  const d = { comprador }
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

  return compradorId!
}

export interface DadosVenda {
  comprador: DadosComprador
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
  const compradorId = await obterComprador(db, tenantId, d.comprador)

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
  const [data, contratos, devolucoes] = await Promise.all([
    paginar((de, ate) =>
      db
        .from('vendas')
        .select(
          'id, situacao, data_venda, preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema, primeira_parcela_em, comissao_percentual, comissao_modo, lotes(numero, quadras(codigo)), contratos(distratos(data))',
        )
        .eq('empreendimento_id', empreendimentoId)
        .in('situacao', ['ativa', 'distratada'])
        .order('id')
        .range(de, ate),
    ),
    parcelasPorVenda(db, empreendimentoId),
    paginar((de, ate) =>
      db
        .from('devolucoes')
        .select(
          'vencimento, valor_centavos, pago_em, distratos!inner(contratos!inner(venda_id, empreendimento_id))',
        )
        .eq('distratos.contratos.empreendimento_id', empreendimentoId)
        .order('id')
        .range(de, ate),
    ),
  ])
  return data.map((v) => ({
    rotulo: `Quadra ${v.lotes?.quadras?.codigo ?? '?'} · Lote ${v.lotes?.numero ?? '?'}`,
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
    ...(v.situacao === 'distratada'
      ? {
          distrato: {
            data: (() => {
              const c = Array.isArray(v.contratos) ? v.contratos[0] : v.contratos
              const d = c && (Array.isArray(c.distratos) ? c.distratos[0] : c.distratos)
              return d?.data ?? null
            })(),
            devolucoes: devolucoes
              .filter((d) => d.distratos.contratos.venda_id === v.id)
              .map((d) => ({
                vencimento: d.vencimento,
                valorCentavos: d.valor_centavos,
                pagoEm: d.pago_em,
              })),
          },
        }
      : {}),
  }))
}

/** Publica uma tabela de preços (RN-C05): a vigente reajustada, com preços próprios por lote. */
export async function publicarTabelaPreco(
  db: ClienteBanco,
  empreendimentoId: string,
  t: { nome: string; vigenteDesde: string; reajuste: string; precos: Record<string, number> },
): Promise<string> {
  const { data, error } = await db.rpc('publicar_tabela_preco', {
    p_empreendimento: empreendimentoId,
    p_nome: t.nome,
    p_vigente_desde: t.vigenteDesde,
    p_reajuste: Number(t.reajuste),
    p_precos: t.precos,
  })
  falhar(error)
  return data!
}

/** Pede a aprovação de um preço com desconto acima do limite (RN-C05). */
export async function solicitarAprovacaoDesconto(
  db: ClienteBanco,
  loteId: string,
  precoCentavos: number,
  data: string,
  justificativa: string,
): Promise<string> {
  const { data: id, error } = await db.rpc('solicitar_aprovacao_desconto', {
    p_lote: loteId,
    p_preco: precoCentavos,
    p_data: data,
    p_justificativa: justificativa,
  })
  falhar(error)
  return id!
}

export async function decidirAprovacaoDesconto(
  db: ClienteBanco,
  aprovacaoId: string,
  aprovar: boolean,
  motivo?: string,
) {
  const { error } = await db.rpc('decidir_aprovacao_desconto', {
    p_aprovacao: aprovacaoId,
    p_aprovar: aprovar,
    ...(motivo ? { p_motivo: motivo } : {}),
  })
  falhar(error)
}

export interface CondicoesPreco {
  /** Preço da tabela vigente na data (ou o de cadastro, sem tabela). */
  precoTabelaCentavos: number | null
  /** Desconto máximo sem aprovação (fração); nulo = a loteadora não definiu limite. */
  limiteDesconto: string | null
  /** Último pedido de desconto ainda em aberto para o lote. */
  pedido: {
    situacao: 'pendente' | 'aprovada'
    precoCentavos: number
    validaAte: string | null
  } | null
}

/** O que a venda precisa saber do preço do lote numa data (RN-C05). */
export async function condicoesDePreco(
  db: ClienteBanco,
  tenantId: string,
  empreendimentoId: string,
  loteId: string,
  data: string,
): Promise<CondicoesPreco> {
  const [tabela, limite, pedido] = await Promise.all([
    db.rpc('preco_tabela', { p_lote: loteId, p_data: data }),
    db.rpc('parametro_vigente', {
      p_chave: 'comercial.desconto_maximo_sem_aprovacao',
      p_data: data,
      p_tenant: tenantId,
      p_escopo: 'empreendimento',
      p_escopo_id: empreendimentoId,
    }),
    db
      .from('aprovacoes_desconto')
      .select('situacao, preco_centavos, valida_ate')
      .eq('lote_id', loteId)
      .in('situacao', ['pendente', 'aprovada'])
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  falhar(tabela.error)
  falhar(limite.error)
  falhar(pedido.error)
  return {
    precoTabelaCentavos: tabela.data ?? null,
    limiteDesconto:
      limite.data === null || limite.data === undefined
        ? null
        : String(limite.data).replace(/^"|"$/g, ''),
    pedido: pedido.data
      ? {
          situacao: pedido.data.situacao as 'pendente' | 'aprovada',
          precoCentavos: pedido.data.preco_centavos,
          validaAte: pedido.data.valida_ate,
        }
      : null,
  }
}

export interface DadosProposta {
  cliente: DadosComprador
  corretorId: string | null
  precoCentavos: number
  entradaCentavos: number
  parcelas: number
  jurosMensal: string
  sistema: 'price' | 'sac'
  primeiraParcelaEm: string | null
  validaAte: string
  observacao: string | null
}

/** Registra a proposta do cliente para o lote (condições antes da venda). */
export async function criarProposta(
  db: ClienteBanco,
  loteId: string,
  d: DadosProposta,
): Promise<string> {
  const { data, error } = await db.rpc('criar_proposta', {
    p_lote: loteId,
    p_proposta: {
      cliente_nome: d.cliente.nome,
      cliente_cpf: d.cliente.cpf,
      cliente_email: d.cliente.email,
      cliente_telefone: d.cliente.telefone,
      corretor_id: d.corretorId,
      preco_centavos: d.precoCentavos,
      entrada_centavos: d.entradaCentavos,
      parcelas: d.parcelas,
      juros_mensal: d.jurosMensal,
      sistema: d.sistema,
      primeira_parcela_em: d.primeiraParcelaEm,
      valida_ate: d.validaAte,
      observacao: d.observacao,
    },
  })
  if (error?.code === '23514' && /cpf/i.test(error.message))
    throw new ErroAplicacao('CPF inválido: confira os dígitos.', 'cpf', 'cpf')
  falhar(error)
  return data!
}

export async function decidirProposta(
  db: ClienteBanco,
  propostaId: string,
  aceitar: boolean,
  motivo?: string,
) {
  const { error } = await db.rpc('decidir_proposta', {
    p_proposta: propostaId,
    p_aceitar: aceitar,
    ...(motivo ? { p_motivo: motivo } : {}),
  })
  falhar(error)
}

export async function cancelarProposta(db: ClienteBanco, propostaId: string, motivo: string) {
  const { error } = await db.rpc('cancelar_proposta', { p_proposta: propostaId, p_motivo: motivo })
  falhar(error)
}
