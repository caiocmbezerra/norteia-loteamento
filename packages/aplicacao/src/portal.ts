import type { ClienteBanco } from '@norteia/db'
import { formatarData, formatarMoeda } from '@norteia/dominio'
import { gerarExtratoPdf } from '@norteia/integracoes/extrato-pdf'
import {
  Decimal,
  type QuitacaoAntecipada,
  centavos,
  quitacaoAntecipada,
} from '@norteia/motor-financeiro'
import { type ApuracaoRepasse, type VendaReal, apurarRepasses } from '@norteia/projecao'
import { traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export interface MeuPortal {
  contratos: {
    id: string
    loteadora: string
    empreendimento: string
    lote: string
    situacao: string
    boleto_disponivel: boolean
    saldo: number
    vencido: number
    proxima: { id: string; numero: number; vencimento: string; saldo: number } | null
  }[]
  sociedades: {
    spe: string
    loteadora: string
    socio: string
    participacao: number | null
    aportes: number
    recebido: number
    movimentos: { data: string; tipo: string; valor: number }[]
  }[]
  permutas: {
    id: string
    loteadora: string
    empreendimento: string
    tipo: 'fisica' | 'financeira'
    percentual: number | null
    base: string | null
    lotes: number
  }[]
}

export interface ContratoPortal {
  id: string
  situacao: string
  indice: string | null
  quitado_em: string | null
  numero: number | null
  comprador: string
  vendedora: string
  /** Condições do próprio contrato (frações). */
  juros_mensal: number
  multa_atraso: number
  juros_mora_mensal: number
  loteadora: string
  empreendimento: string
  lote: string
  boleto_disponivel: boolean
  parcelas: {
    id: string
    numero: number
    vencimento: string
    valor: number
    pago: number
    situacao: string
    link: string | null
  }[]
  pagamentos: { data: string; valor: number; parcela: number }[]
}

/** O que o usuário logado tem como comprador, sócio ou permutante (qualquer loteadora). */
export async function carregarMeuPortal(db: ClienteBanco, hoje: string): Promise<MeuPortal> {
  const { data, error } = await db.rpc('meu_portal', { p_hoje: hoje })
  falhar(error)
  return data as unknown as MeuPortal
}

export function temPortal(p: MeuPortal) {
  return p.contratos.length + p.sociedades.length + p.permutas.length > 0
}

export async function carregarContratoPortal(
  db: ClienteBanco,
  contratoId: string,
): Promise<ContratoPortal | null> {
  const { data, error } = await db.rpc('portal_contrato', { p_contrato: contratoId })
  if (error?.code === '42501') return null
  falhar(error)
  return data as unknown as ContratoPortal
}

/** Segunda via pelo comprador: link do boleto/Pix (pendente ou emitido agora). */
export async function emitirSegundaVia(db: ClienteBanco, parcelaId: string): Promise<string> {
  const { data, error } = await db.rpc('segunda_via', { p_parcela: parcelaId })
  falhar(error)
  return data!
}

interface EventosPermuta {
  permuta: {
    id: string
    tipo: string
    percentual: number | null
    base: 'recebido' | 'principal' | 'vgv' | null
    abate_distrato: boolean | null
    inicio: string
    empreendimento: string
    loteadora: string
  }
  pagos: { data: string; valor: number }[]
  vendas: {
    rotulo: string
    data_venda: string
    preco: number
    distrato_data: string | null
    parcelas: {
      numero: number
      valor: number
      amortizacao: number
      correcao: number
      recebimentos: { data: string; principal: number; encargos: number }[]
    }[]
    devolucoes: { vencimento: string; valor: number; pago_em: string | null }[]
  }[]
}

/** Extrato do permutante (RN-T05), apurado com a mesma regra da gestão. */
export async function extratoPermutante(
  db: ClienteBanco,
  permutaId: string,
  hoje: string,
): Promise<{
  permuta: EventosPermuta['permuta']
  pagos: EventosPermuta['pagos']
  apuracao: ApuracaoRepasse | null
} | null> {
  const { data, error } = await db.rpc('eventos_permuta', { p_permuta: permutaId })
  if (error?.code === '42501') return null
  falhar(error)
  const e = data as unknown as EventosPermuta
  if (e.permuta.tipo !== 'financeira') return { permuta: e.permuta, pagos: e.pagos, apuracao: null }
  const vendas: VendaReal[] = e.vendas.map((v) => ({
    rotulo: v.rotulo,
    dataVenda: v.data_venda,
    precoCentavos: v.preco,
    entradaCentavos: 0,
    parcelas: 0,
    jurosMensal: '0',
    sistema: 'price',
    primeiraParcelaEm: null,
    comissaoPercentual: '0',
    comissaoModo: 'ato',
    contrato: v.parcelas.map((p) => ({
      numero: p.numero,
      vencimento: v.data_venda,
      valorCentavos: p.valor,
      amortizacaoCentavos: p.amortizacao,
      jurosCentavos: p.valor - p.amortizacao - p.correcao,
      correcaoCentavos: p.correcao,
      situacao: 'aberta',
      recebimentos: p.recebimentos.map((r) => ({
        data: r.data,
        principalCentavos: r.principal,
        encargosCentavos: r.encargos,
      })),
    })),
    ...(v.distrato_data
      ? {
          distrato: {
            data: v.distrato_data,
            devolucoes: v.devolucoes.map((d) => ({
              vencimento: d.vencimento,
              valorCentavos: d.valor,
              pagoEm: d.pago_em,
            })),
          },
        }
      : {}),
  }))
  const apuracao = apurarRepasses(
    {
      id: e.permuta.id,
      percentual: String(e.permuta.percentual),
      base: e.permuta.base!,
      abateDistrato: !!e.permuta.abate_distrato,
      inicio: e.permuta.inicio,
      pagos: e.pagos.map((p) => ({ data: p.data, valorCentavos: p.valor })),
    },
    vendas,
    hoje,
  )
  return { permuta: e.permuta, pagos: e.pagos, apuracao }
}

/** Convite para o portal: devolve o token (o link é montado pelo app). */
export async function convidarParaPortal(
  db: ClienteBanco,
  tenantId: string,
  tipo: 'comprador' | 'socio' | 'permutante',
  alvoId: string,
  email: string,
): Promise<string> {
  const { data, error } = await db.rpc('criar_convite_portal', {
    p_tenant: tenantId,
    p_tipo: tipo,
    p_alvo: alvoId,
    p_email: email,
  })
  falhar(error)
  return data!
}

/** Envia o convite por e-mail (D-116): 'enviado', 'falhou' ou 'repetido'. */
export async function enviarConvitePortal(db: ClienteBanco, token: string): Promise<string> {
  const { data, error } = await db.rpc('enviar_convite_portal', { p_token: token })
  falhar(error)
  return data!
}

export async function aceitarConvitePortal(db: ClienteBanco, token: string): Promise<string> {
  const { data, error } = await db.rpc('aceitar_convite_portal', { p_token: token })
  falhar(error)
  return data!
}

/** Andamento da obra (avanço financeiro da infraestrutura) para o comprador. */
export async function andamentoObra(
  db: ClienteBanco,
  contratoId: string,
): Promise<{ etapa: string; orcado: number; pago: number }[]> {
  const { data, error } = await db.rpc('obra_portal', { p_contrato: contratoId })
  if (error?.code === '42501') return []
  falhar(error)
  return data as unknown as { etapa: string; orcado: number; pago: number }[]
}

/** Quanto custa quitar hoje (estimativa do motor: desconto nas a vencer, encargos nas vencidas). */
export function quitacaoHoje(c: ContratoPortal, hoje: string): QuitacaoAntecipada {
  return quitacaoAntecipada(
    c.parcelas
      .filter((p) => p.situacao === 'aberta')
      .map((p) => ({ vencimento: p.vencimento, saldoCentavos: centavos(p.valor - p.pago) })),
    hoje,
    new Decimal(String(c.juros_mensal ?? 0)),
    {
      multa: new Decimal(String(c.multa_atraso ?? 0)),
      jurosMoraMensal: new Decimal(String(c.juros_mora_mensal ?? 0)),
    },
  )
}

const SITUACAO_PARCELA: Record<string, string> = {
  aberta: 'Em aberto',
  paga: 'Paga',
  renegociada: 'Renegociada',
}

/** Extrato do contrato em PDF para o próprio comprador (nulo se não for dele). */
export async function extratoPortalPdf(
  db: ClienteBanco,
  contratoId: string,
  hoje: string,
): Promise<{ nomeArquivo: string; conteudo: Uint8Array } | null> {
  const c = await carregarContratoPortal(db, contratoId)
  if (!c) return null
  const moeda = (v: number) => formatarMoeda(centavos(v))
  const abertas = c.parcelas.filter((p) => p.situacao === 'aberta')
  const saldo = abertas.reduce((t, p) => t + p.valor - p.pago, 0)
  const vencido = abertas
    .filter((p) => p.vencimento < hoje)
    .reduce((t, p) => t + p.valor - p.pago, 0)
  const pago = c.pagamentos.reduce((t, p) => t + p.valor, 0)
  const q = quitacaoHoje(c, hoje)
  const conteudo = await gerarExtratoPdf({
    titulo: `Extrato do contrato${c.numero ? ` nº ${c.numero}` : ''}`,
    identificacao: [
      ['Vendedora', c.vendedora],
      ['Loteadora', c.loteadora],
      ['Comprador', c.comprador],
      ['Imóvel', `${c.empreendimento} · ${c.lote}`],
      ['Reajuste', c.indice ?? 'sem reajuste'],
      [
        'Situação',
        c.situacao === 'quitado' ? 'Quitado' : c.situacao === 'vigente' ? 'Vigente' : c.situacao,
      ],
    ],
    resumo: [
      ['Total pago', moeda(pago)],
      ['Saldo a pagar (soma das parcelas em aberto)', moeda(saldo)],
      ['Em atraso', moeda(vencido)],
      ...(saldo > 0
        ? ([[`Para quitar hoje (estimativa em ${formatarData(hoje)})`, moeda(q.totalCentavos)]] as [
            string,
            string,
          ][])
        : []),
    ],
    parcelas: c.parcelas.map((p) => ({
      numero: p.numero === 0 ? 'Entrada' : String(p.numero),
      vencimento: formatarData(p.vencimento),
      valor: moeda(p.valor),
      pago: moeda(p.pago),
      situacao:
        p.situacao === 'aberta' && p.vencimento < hoje
          ? 'Em atraso'
          : (SITUACAO_PARCELA[p.situacao] ?? p.situacao),
    })),
    pagamentos: c.pagamentos.map((p) => ({
      data: formatarData(p.data),
      parcela: p.parcela === 0 ? 'entrada' : String(p.parcela),
      valor: moeda(p.valor),
    })),
    rodape: `Emitido em ${formatarData(hoje)} pelo portal do comprador. Valores sujeitos a conferência pela loteadora.`,
  })
  return {
    nomeArquivo: `extrato-contrato-${c.numero ?? c.id.slice(0, 8)}.pdf`,
    conteudo,
  }
}
