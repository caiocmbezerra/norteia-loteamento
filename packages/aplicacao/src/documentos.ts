import type { ClienteBanco } from '@norteia/db'
import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import {
  type DadosDocumento,
  ErroModelo,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
  modeloPadrao,
  preencherModelo,
} from '@norteia/integracoes'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import { paginar } from './carteira'
import { ErroAplicacao, traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export { TIPOS_DOCUMENTO, type TipoDocumento }

export const NOMES_DOCUMENTO: Record<TipoDocumento, string> = {
  contrato: 'Contrato de compra e venda',
  quitacao: 'Termo de quitação',
  aditivo_renegociacao: 'Aditivo de renegociação',
  aditivo_cessao: 'Aditivo de cessão',
  aditivo_troca_lote: 'Aditivo de troca de lote',
  informe_pagamentos: 'Informe de pagamentos (IR)',
}

/** Marcadores disponíveis nos modelos (o cliente usa no Word entre chaves). */
export const MARCADORES: { marcador: string; descricao: string }[] = [
  { marcador: 'vendedora_razao_social', descricao: 'Razão social da SPE vendedora' },
  { marcador: 'vendedora_cnpj', descricao: 'CNPJ da SPE' },
  { marcador: 'comprador_nome', descricao: 'Nome do comprador (ou cessionário)' },
  { marcador: 'comprador_cpf', descricao: 'CPF do comprador' },
  { marcador: 'comprador_email', descricao: 'E-mail do comprador' },
  { marcador: 'comprador_telefone', descricao: 'Telefone do comprador' },
  { marcador: 'empreendimento_nome', descricao: 'Nome do empreendimento' },
  { marcador: 'cidade', descricao: 'Município/UF do empreendimento' },
  { marcador: 'lote_quadra', descricao: 'Quadra' },
  { marcador: 'lote_numero', descricao: 'Número do lote' },
  { marcador: 'lote_area', descricao: 'Área do lote em m²' },
  { marcador: 'venda_data', descricao: 'Data da venda' },
  { marcador: 'venda_preco', descricao: 'Preço' },
  { marcador: 'venda_entrada', descricao: 'Entrada' },
  { marcador: 'venda_parcelas', descricao: 'Número de parcelas' },
  { marcador: 'venda_juros', descricao: 'Juros ao mês' },
  { marcador: 'venda_sistema', descricao: 'Price ou SAC' },
  { marcador: 'contrato_indice', descricao: 'Índice de reajuste' },
  { marcador: 'contrato_reajuste', descricao: 'Regra de reajuste por extenso' },
  { marcador: 'contrato_multa', descricao: 'Multa por atraso' },
  { marcador: 'contrato_juros_mora', descricao: 'Juros de mora ao mês' },
  {
    marcador: '#parcelas … /parcelas',
    descricao: 'Tabela de parcelas: {numero}, {vencimento}, {valor}',
  },
  { marcador: 'aditivo_data', descricao: 'Data do aditivo' },
  { marcador: 'aditivo_motivo', descricao: 'Motivo do aditivo' },
  { marcador: 'aditivo_saldo_anterior', descricao: 'Saldo antes do aditivo' },
  { marcador: 'aditivo_encargos', descricao: 'Encargos ou diferença de preço acrescidos' },
  { marcador: 'aditivo_desconto', descricao: 'Desconto ou diferença de preço deduzidos' },
  { marcador: 'aditivo_novo_saldo', descricao: 'Novo saldo' },
  { marcador: 'aditivo_lote_anterior', descricao: 'Lote anterior (troca de lote)' },
  { marcador: 'cedente_nome', descricao: 'Nome do cedente (cessão)' },
  { marcador: 'cedente_cpf', descricao: 'CPF do cedente (cessão)' },
  { marcador: 'quitacao_data', descricao: 'Data da quitação' },
  { marcador: 'quitacao_total', descricao: 'Total recebido' },
  { marcador: 'contrato_numero', descricao: 'Número do contrato' },
  { marcador: 'vendedora_endereco', descricao: 'Endereço da SPE vendedora' },
  { marcador: 'informe_ano', descricao: 'Ano-calendário do informe' },
  { marcador: 'informe_pago_ano', descricao: 'Total pago no ano (informe)' },
  { marcador: 'informe_pago_acumulado', descricao: 'Total pago até 31/12 do ano (informe)' },
  {
    marcador: '#pagamentos … /pagamentos',
    descricao: 'Tabela de pagamentos do informe: {data}, {referencia}, {valor}',
  },
  { marcador: 'hoje', descricao: 'Data de emissão' },
]

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const cpf = (v: string | null | undefined) =>
  v ? v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '—'
const cnpj = (v: string | null | undefined) =>
  v ? v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : '—'
const base64 = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}
const deBase64 = (texto: string) => Uint8Array.from(atob(texto), (c) => c.charCodeAt(0))

/** Dados de exemplo para conferir um modelo enviado. */
const EXEMPLO: DadosDocumento = Object.fromEntries([
  ...MARCADORES.filter((m) => !m.marcador.startsWith('#')).map((m) => [m.marcador, 'exemplo']),
  ['parcelas', [{ numero: '1', vencimento: '01/01/2030', valor: 'R$ 1,00' }]],
  ['pagamentos', [{ data: '01/01/2030', referencia: 'Parcela 1', valor: 'R$ 1,00' }]],
])

export interface ModeloCliente {
  tipo: TipoDocumento
  nome: string
  /** Versão enviada pelo cliente em uso; nulo = modelo padrão da plataforma. */
  proprio: { nomeArquivo: string; enviadoEm: string } | null
  versoes: number
}

export async function carregarModelos(
  db: ClienteBanco,
  tenantId: string,
): Promise<ModeloCliente[]> {
  const { data, error } = await db
    .from('modelos_documento')
    .select('tipo, nome_arquivo, ativo, criado_em')
    .eq('tenant_id', tenantId)
    .order('criado_em', { ascending: false })
  falhar(error)
  return TIPOS_DOCUMENTO.map((tipo) => {
    const daqui = (data ?? []).filter((m) => m.tipo === tipo)
    const ativo = daqui.find((m) => m.ativo)
    return {
      tipo,
      nome: NOMES_DOCUMENTO[tipo],
      proprio: ativo ? { nomeArquivo: ativo.nome_arquivo, enviadoEm: ativo.criado_em } : null,
      versoes: daqui.length,
    }
  })
}

/** Modelo em uso (do cliente ou padrão), para baixar e editar no Word. */
export async function modeloEmUso(
  db: ClienteBanco,
  tenantId: string,
  tipo: TipoDocumento,
): Promise<{ nomeArquivo: string; conteudo: Uint8Array }> {
  const { data, error } = await db
    .from('modelos_documento')
    .select('nome_arquivo, conteudo_base64')
    .eq('tenant_id', tenantId)
    .eq('tipo', tipo)
    .eq('ativo', true)
    .maybeSingle()
  falhar(error)
  return data
    ? { nomeArquivo: data.nome_arquivo, conteudo: deBase64(data.conteudo_base64) }
    : { nomeArquivo: `modelo-${tipo.replace(/_/g, '-')}.docx`, conteudo: modeloPadrao(tipo) }
}

/** Confere o modelo (precisa preencher sem erro) e publica como nova versão. */
export async function enviarModelo(
  db: ClienteBanco,
  tenantId: string,
  tipo: TipoDocumento,
  nomeArquivo: string,
  conteudo: Uint8Array,
): Promise<void> {
  if (!/\.docx$/i.test(nomeArquivo))
    throw new ErroAplicacao('Envie um arquivo do Word (.docx).', 'invalido', 'arquivo')
  if (conteudo.length > 2_000_000)
    throw new ErroAplicacao('O arquivo passa de 2 MB.', 'invalido', 'arquivo')
  try {
    preencherModelo(conteudo, EXEMPLO)
  } catch (e) {
    if (e instanceof ErroModelo) throw new ErroAplicacao(e.message, 'invalido', 'arquivo')
    throw e
  }
  const { error } = await db.rpc('publicar_modelo', {
    p_tenant: tenantId,
    p_tipo: tipo,
    p_nome: nomeArquivo,
    p_conteudo: base64(conteudo),
  })
  falhar(error)
}

export async function usarModeloPadrao(db: ClienteBanco, tenantId: string, tipo: TipoDocumento) {
  const { error } = await db.rpc('usar_modelo_padrao', { p_tenant: tenantId, p_tipo: tipo })
  falhar(error)
}

interface ContratoDocumento {
  situacao: string
  quitado_em: string | null
  indice_reajuste: string | null
  multa_atraso: number
  juros_mora_mensal: number
  reajuste_periodicidade_meses: number
  reajuste_defasagem_meses: number
  compradores: {
    nome: string
    cpf: string | null
    email: string | null
    telefone: string | null
  } | null
  lotes: { numero: string; area_m2: number | null; quadras: { codigo: string } | null } | null
  vendas: {
    data_venda: string
    preco_centavos: number
    entrada_centavos: number
    parcelas: number
    juros_mensal: number
    sistema: string
  } | null
  empreendimentos: {
    nome: string
    municipio: string | null
    uf: string | null
    spes: { razao_social: string; cnpj: string | null } | null
  } | null
}

/** Valores do documento a partir dos dados do contrato (mesmo mapa na gestão e no portal). */
function montarDados({
  c,
  parcelas,
  tipo,
  aditivoId,
  aditivo,
  loteAnterior,
  cedente,
  recebidoCentavos,
  hoje,
}: {
  c: ContratoDocumento
  parcelas: {
    numero: number
    vencimento: string
    valor_centavos: number
    situacao: string
    aditivo_origem_id: string | null
  }[]
  tipo: TipoDocumento
  aditivoId?: string | undefined
  aditivo: {
    data: string
    motivo: string
    saldo_anterior_centavos: number
    encargos_incorporados_centavos: number
    desconto_centavos: number
    novo_saldo_centavos: number
  } | null
  loteAnterior: { numero: string; quadras: { codigo: string } | null } | null
  cedente: { nome: string; cpf: string | null } | null
  recebidoCentavos: number
  hoje: string
}): DadosDocumento {
  const doPlano = parcelas.filter((p) =>
    tipo === 'aditivo_renegociacao' || tipo === 'aditivo_troca_lote'
      ? p.aditivo_origem_id === aditivoId
      : p.numero > 0 && p.situacao !== 'cancelada',
  )
  const v = c.vendas
  const e = c.empreendimentos
  const dados: DadosDocumento = {
    vendedora_razao_social: e?.spes?.razao_social ?? '',
    vendedora_cnpj: cnpj(e?.spes?.cnpj),
    comprador_nome: c.compradores?.nome ?? '',
    comprador_cpf: cpf(c.compradores?.cpf),
    comprador_email: c.compradores?.email ?? '—',
    comprador_telefone: c.compradores?.telefone ?? '—',
    empreendimento_nome: e?.nome ?? '',
    cidade: e?.municipio ? `${e.municipio}${e.uf ? `/${e.uf}` : ''}` : '',
    lote_quadra: c.lotes?.quadras?.codigo ?? '',
    lote_numero: c.lotes?.numero ?? '',
    lote_area: String(c.lotes?.area_m2 ?? '').replace('.', ','),
    venda_data: v ? formatarData(v.data_venda) : '',
    venda_preco: v ? moeda(v.preco_centavos) : '',
    venda_entrada: v ? moeda(v.entrada_centavos) : '',
    venda_parcelas: String(v?.parcelas ?? ''),
    venda_juros: v ? formatarPercentual(String(v.juros_mensal), 2) : '',
    venda_sistema: v?.sistema === 'sac' ? 'SAC' : 'Price',
    contrato_indice: c.indice_reajuste ?? 'sem reajuste',
    contrato_reajuste: c.indice_reajuste
      ? `a cada ${c.reajuste_periodicidade_meses} meses contados da venda, pelo índice acumulado até ${c.reajuste_defasagem_meses} meses antes do aniversário`
      : 'sem reajuste',
    contrato_multa: formatarPercentual(String(c.multa_atraso), 2),
    contrato_juros_mora: formatarPercentual(String(c.juros_mora_mensal), 2),
    parcelas: doPlano.map((p) => ({
      numero: String(p.numero),
      vencimento: formatarData(p.vencimento),
      valor: moeda(p.valor_centavos),
    })),
    aditivo_data: aditivo ? formatarData(aditivo.data) : '',
    aditivo_motivo: aditivo?.motivo ?? '',
    aditivo_saldo_anterior: aditivo ? moeda(aditivo.saldo_anterior_centavos) : '',
    aditivo_encargos: aditivo ? moeda(aditivo.encargos_incorporados_centavos) : '',
    aditivo_desconto: aditivo ? moeda(aditivo.desconto_centavos) : '',
    aditivo_novo_saldo: aditivo ? moeda(aditivo.novo_saldo_centavos) : '',
    aditivo_lote_anterior: loteAnterior
      ? `Lote ${loteAnterior.numero} da Quadra ${loteAnterior.quadras?.codigo ?? '?'}`
      : '',
    cedente_nome: cedente?.nome ?? '',
    cedente_cpf: cpf(cedente?.cpf),
    quitacao_data: c.quitado_em ? formatarData(c.quitado_em) : '',
    quitacao_total: moeda(recebidoCentavos),
    hoje: formatarData(hoje),
  }
  return dados
}

/**
 * Gera o documento de um contrato (ou de um aditivo dele) com o modelo em uso do cliente.
 */
export async function gerarDocumento(
  db: ClienteBanco,
  tenantId: string,
  contratoId: string,
  tipo: TipoDocumento,
  hoje: string,
  aditivoId?: string,
): Promise<{ nomeArquivo: string; conteudo: Uint8Array }> {
  const { data: c, error } = await db
    .from('contratos')
    .select(
      'id, situacao, quitado_em, indice_reajuste, multa_atraso, juros_mora_mensal, reajuste_periodicidade_meses, reajuste_defasagem_meses, compradores(nome, cpf, email, telefone), lotes(numero, area_m2, quadras(codigo)), vendas(data_venda, preco_centavos, entrada_centavos, parcelas, juros_mensal, sistema), empreendimentos(nome, municipio, uf, spes(razao_social, cnpj))',
    )
    .eq('id', contratoId)
    .single()
  falhar(error)
  if (tipo === 'informe_pagamentos')
    throw new ErroAplicacao('O informe de pagamentos é gerado por ano.', 'invalido')
  if (tipo === 'quitacao' && c!.situacao !== 'quitado')
    throw new ErroAplicacao('O termo de quitação só sai com o contrato quitado.', 'invalido')

  const [parcelas, aditivo] = await Promise.all([
    paginar((de, ate) =>
      db
        .from('parcelas')
        .select('id, numero, vencimento, valor_centavos, situacao, aditivo_origem_id')
        .eq('contrato_id', contratoId)
        .order('numero')
        .range(de, ate),
    ),
    aditivoId
      ? db
          .from('aditivos')
          .select(
            'tipo, data, motivo, condicoes, saldo_anterior_centavos, encargos_incorporados_centavos, desconto_centavos, novo_saldo_centavos',
          )
          .eq('id', aditivoId)
          .eq('contrato_id', contratoId)
          .single()
      : Promise.resolve({ data: null, error: null }),
  ])
  falhar(aditivo.error)
  if (tipo.startsWith('aditivo_') && (!aditivo.data || `aditivo_${aditivo.data.tipo}` !== tipo))
    throw new ErroAplicacao('Aditivo não encontrado.', 'nao_encontrado')

  const condicoes = (aditivo.data?.condicoes ?? {}) as Record<string, string>
  const [cedente, loteAnterior, recebidos] = await Promise.all([
    condicoes.cedente_id
      ? db.from('compradores').select('nome, cpf').eq('id', condicoes.cedente_id).maybeSingle()
      : Promise.resolve({ data: null }),
    condicoes.lote_anterior_id
      ? db
          .from('lotes')
          .select('numero, quadras(codigo)')
          .eq('id', condicoes.lote_anterior_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tipo === 'quitacao'
      ? paginar((de, ate) =>
          db
            .from('recebimentos')
            .select('valor_centavos, parcelas!inner(contrato_id)')
            .eq('parcelas.contrato_id', contratoId)
            .is('estornado_em', null)
            .order('id')
            .range(de, ate),
        )
      : Promise.resolve([] as { valor_centavos: number }[]),
  ])

  const dados = montarDados({
    c: c!,
    parcelas,
    tipo,
    aditivoId,
    aditivo: aditivo.data,
    loteAnterior: loteAnterior.data,
    cedente: cedente.data,
    recebidoCentavos: recebidos.reduce((t, r) => t + r.valor_centavos, 0),
    hoje,
  })
  const modelo = await modeloEmUso(db, tenantId, tipo)
  let conteudo: Uint8Array
  try {
    conteudo = preencherModelo(modelo.conteudo, dados)
  } catch (erro) {
    if (erro instanceof ErroModelo) throw new ErroAplicacao(erro.message, 'invalido')
    throw erro
  }
  const lote = `quadra-${dados.lote_quadra}-lote-${dados.lote_numero}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
  return { nomeArquivo: `${tipo.replace(/_/g, '-')}-${lote}.docx`, conteudo }
}

interface InformeBanco {
  ano: number
  contrato_numero: number
  vendedora: { razao_social: string; cnpj: string | null; endereco: string | null }
  comprador: { nome: string; cpf: string | null }
  imovel: {
    empreendimento: string
    municipio: string | null
    uf: string | null
    endereco: string | null
    quadra: string
    lote: string
    area_m2: number | null
  }
  venda: { data: string; preco: number }
  pagamentos: { data: string; parcela: number; valor: number }[]
  pago_ate_fim_do_ano: number
  modelo: string | null
}

/**
 * Informe de pagamentos do ano para o IR do comprador, com o modelo do cliente. Serve à gestão e
 * ao portal (a função de banco confere quem pede). Nulo se o contrato não é visível.
 */
export async function gerarInforme(
  db: ClienteBanco,
  contratoId: string,
  ano: number,
  hoje: string,
): Promise<{ nomeArquivo: string; conteudo: Uint8Array } | null> {
  const { data, error } = await db.rpc('informe_pagamentos', { p_contrato: contratoId, p_ano: ano })
  if (error?.code === '42501') return null
  falhar(error)
  const i = data as unknown as InformeBanco
  const dados: DadosDocumento = {
    vendedora_razao_social: i.vendedora.razao_social,
    vendedora_cnpj: cnpj(i.vendedora.cnpj),
    vendedora_endereco: i.vendedora.endereco ?? '—',
    comprador_nome: i.comprador.nome,
    comprador_cpf: cpf(i.comprador.cpf),
    empreendimento_nome: i.imovel.empreendimento,
    cidade: i.imovel.municipio
      ? `${i.imovel.municipio}${i.imovel.uf ? `/${i.imovel.uf}` : ''}`
      : '',
    lote_quadra: i.imovel.quadra,
    lote_numero: i.imovel.lote,
    lote_area: String(i.imovel.area_m2 ?? '').replace('.', ','),
    contrato_numero: String(i.contrato_numero),
    venda_data: formatarData(i.venda.data),
    venda_preco: moeda(i.venda.preco),
    informe_ano: String(i.ano),
    informe_pago_ano: moeda(i.pagamentos.reduce((t, p) => t + p.valor, 0)),
    informe_pago_acumulado: moeda(i.pago_ate_fim_do_ano),
    pagamentos: i.pagamentos.map((p) => ({
      data: formatarData(p.data),
      referencia: p.parcela === 0 ? 'Entrada' : `Parcela ${p.parcela}`,
      valor: moeda(p.valor),
    })),
    hoje: formatarData(hoje),
  }
  let conteudo: Uint8Array
  try {
    conteudo = preencherModelo(
      i.modelo ? deBase64(i.modelo) : modeloPadrao('informe_pagamentos'),
      dados,
    )
  } catch (erro) {
    if (erro instanceof ErroModelo) throw new ErroAplicacao(erro.message, 'invalido')
    throw erro
  }
  return {
    nomeArquivo: `informe-pagamentos-${ano}-contrato-${i.contrato_numero}.docx`,
    conteudo,
  }
}

/** Contrato ou termo de quitação baixado pelo próprio comprador (portal). Nulo se não for dele. */
export async function gerarDocumentoPortal(
  db: ClienteBanco,
  contratoId: string,
  tipo: 'contrato' | 'quitacao',
  hoje: string,
): Promise<{ nomeArquivo: string; conteudo: Uint8Array } | null> {
  const { data, error } = await db.rpc('documento_portal', { p_contrato: contratoId, p_tipo: tipo })
  if (error?.code === '42501') return null
  falhar(error)
  const d = data as unknown as {
    contrato: ContratoDocumento
    parcelas: Parameters<typeof montarDados>[0]['parcelas']
    recebido_centavos: number
    modelo: string | null
  }
  const dados = montarDados({
    c: d.contrato,
    parcelas: d.parcelas,
    tipo,
    aditivo: null,
    loteAnterior: null,
    cedente: null,
    recebidoCentavos: d.recebido_centavos,
    hoje,
  })
  let conteudo: Uint8Array
  try {
    conteudo = preencherModelo(d.modelo ? deBase64(d.modelo) : modeloPadrao(tipo), dados)
  } catch (erro) {
    if (erro instanceof ErroModelo) throw new ErroAplicacao(erro.message, 'invalido')
    throw erro
  }
  const lote = `quadra-${dados.lote_quadra}-lote-${dados.lote_numero}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
  return { nomeArquivo: `${tipo}-${lote}.docx`, conteudo }
}
