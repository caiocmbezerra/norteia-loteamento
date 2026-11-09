/**
 * Exportação contábil configurável (D-059): os fatos viram eventos; cada cliente mapeia evento →
 * conta de débito e de crédito do seu plano e escolhe o formato do arquivo (CSV) que o sistema do
 * contador importa. Também agrega a visão caixa × competência a partir dos mesmos eventos.
 */

export const EVENTOS_CONTABEIS = {
  venda_contratada: 'Venda contratada (competência)',
  distrato: 'Distrato (estorno da venda)',
  recebimento_parcela: 'Recebimento de parcela',
  recebimento_encargos: 'Recebimento de multa e juros de mora',
  desconto_concedido: 'Desconto concedido',
  devolucao_distrato: 'Devolução paga em distrato',
  repasse_permuta: 'Repasse ao permutante',
  custo_lancado: 'Custo lançado (competência)',
  custo_pago: 'Pagamento de custo',
  aporte_socio: 'Aporte de sócio',
  mutuo_socio: 'Mútuo de sócio',
  devolucao_mutuo: 'Devolução de mútuo',
  distribuicao: 'Distribuição a sócio',
} as const
export type EventoContabil = keyof typeof EVENTOS_CONTABEIS

export interface FatoContabil {
  /** AAAA-MM-DD */
  data: string
  evento: EventoContabil
  valor: number
  documento: string
  empreendimento: string | null
  descricao: string
}

export interface RegraContabil {
  evento: EventoContabil
  contaDebito: string
  contaCredito: string
  /** Modelo do histórico: {descricao}, {documento}, {empreendimento}, {evento}. */
  historico: string
}

export interface LancamentoContabil {
  data: string
  debito: string
  credito: string
  valorCentavos: number
  historico: string
  documento: string
  empreendimento: string
}

export const COLUNAS_CONTABEIS = [
  'data',
  'debito',
  'credito',
  'valor',
  'historico',
  'documento',
  'empreendimento',
] as const
export type ColunaContabil = (typeof COLUNAS_CONTABEIS)[number]

export interface FormatoContabil {
  separador: ';' | ',' | 'tab' | '|'
  decimal: ',' | '.'
  formatoData: 'DD/MM/AAAA' | 'AAAA-MM-DD' | 'DDMMAAAA'
  colunas: ColunaContabil[]
  cabecalho: boolean
}

export const FORMATO_PADRAO: FormatoContabil = {
  separador: ';',
  decimal: ',',
  formatoData: 'DD/MM/AAAA',
  colunas: ['data', 'debito', 'credito', 'valor', 'historico', 'documento'],
  cabecalho: true,
}

/** Lançamentos pelas regras do cliente; eventos sem regra ficam de fora e são apontados. */
export function lancamentosContabeis(
  fatos: readonly FatoContabil[],
  regras: readonly RegraContabil[],
): {
  lancamentos: LancamentoContabil[]
  semRegra: { evento: EventoContabil; quantidade: number }[]
} {
  const porEvento = new Map(regras.map((r) => [r.evento, r]))
  const faltas = new Map<EventoContabil, number>()
  const lancamentos: LancamentoContabil[] = []
  for (const f of fatos) {
    const r = porEvento.get(f.evento)
    if (!r) {
      faltas.set(f.evento, (faltas.get(f.evento) ?? 0) + 1)
      continue
    }
    const historico = r.historico
      .replaceAll('{descricao}', f.descricao)
      .replaceAll('{documento}', f.documento)
      .replaceAll('{empreendimento}', f.empreendimento ?? '')
      .replaceAll('{evento}', EVENTOS_CONTABEIS[f.evento])
      .trim()
    lancamentos.push({
      data: f.data,
      debito: r.contaDebito,
      credito: r.contaCredito,
      valorCentavos: f.valor,
      historico,
      documento: f.documento,
      empreendimento: f.empreendimento ?? '',
    })
  }
  return {
    lancamentos,
    semRegra: [...faltas].map(([evento, quantidade]) => ({ evento, quantidade })),
  }
}

function data(iso: string, formato: FormatoContabil['formatoData']): string {
  const [a, m, d] = iso.split('-')
  if (formato === 'AAAA-MM-DD') return iso
  return formato === 'DDMMAAAA' ? `${d}${m}${a}` : `${d}/${m}/${a}`
}

function valor(centavos: number, decimal: ',' | '.'): string {
  const sinal = centavos < 0 ? '-' : ''
  const abs = Math.abs(centavos)
  return `${sinal}${Math.floor(abs / 100)}${decimal}${String(abs % 100).padStart(2, '0')}`
}

const ROTULOS: Record<ColunaContabil, string> = {
  data: 'Data',
  debito: 'Debito',
  credito: 'Credito',
  valor: 'Valor',
  historico: 'Historico',
  documento: 'Documento',
  empreendimento: 'Empreendimento',
}

/** CSV no formato do cliente (UTF-8, linhas CRLF; campos com separador ou aspas vão entre aspas). */
export function arquivoContabil(
  lancamentos: readonly LancamentoContabil[],
  formato: FormatoContabil,
): string {
  const sep = formato.separador === 'tab' ? '\t' : formato.separador
  const campo = (t: string) =>
    t.includes(sep) || t.includes('"') || /[\r\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t
  const linhas: string[] = []
  if (formato.cabecalho) linhas.push(formato.colunas.map((c) => ROTULOS[c]).join(sep))
  for (const l of lancamentos) {
    const v: Record<ColunaContabil, string> = {
      data: data(l.data, formato.formatoData),
      debito: l.debito,
      credito: l.credito,
      valor: valor(l.valorCentavos, formato.decimal),
      historico: l.historico,
      documento: l.documento,
      empreendimento: l.empreendimento,
    }
    linhas.push(formato.colunas.map((c) => campo(v[c])).join(sep))
  }
  return linhas.map((l) => `${l}\r\n`).join('')
}

export interface MesCaixaCompetencia {
  /** AAAA-MM */
  mes: string
  /** Vendas contratadas − distratos. */
  receitaCompetenciaCentavos: number
  /** Recebimentos (parcela + encargos) − devoluções de distrato. */
  receitaCaixaCentavos: number
  custoCompetenciaCentavos: number
  custoCaixaCentavos: number
  resultadoCompetenciaCentavos: number
  resultadoCaixaCentavos: number
}

/** Visão gerencial caixa × competência por mês, a partir dos mesmos eventos da exportação. */
export function caixaCompetencia(fatos: readonly FatoContabil[]): MesCaixaCompetencia[] {
  const meses = new Map<string, MesCaixaCompetencia>()
  const mes = (m: string) => {
    let x = meses.get(m)
    if (!x) {
      x = {
        mes: m,
        receitaCompetenciaCentavos: 0,
        receitaCaixaCentavos: 0,
        custoCompetenciaCentavos: 0,
        custoCaixaCentavos: 0,
        resultadoCompetenciaCentavos: 0,
        resultadoCaixaCentavos: 0,
      }
      meses.set(m, x)
    }
    return x
  }
  for (const f of fatos) {
    const x = mes(f.data.slice(0, 7))
    switch (f.evento) {
      case 'venda_contratada':
        x.receitaCompetenciaCentavos += f.valor
        break
      case 'distrato':
        x.receitaCompetenciaCentavos -= f.valor
        break
      case 'recebimento_parcela':
      case 'recebimento_encargos':
        x.receitaCaixaCentavos += f.valor
        break
      case 'devolucao_distrato':
        x.receitaCaixaCentavos -= f.valor
        break
      case 'custo_lancado':
        x.custoCompetenciaCentavos += f.valor
        break
      case 'custo_pago':
        x.custoCaixaCentavos += f.valor
        break
      default:
        break
    }
  }
  return [...meses.values()]
    .map((x) => ({
      ...x,
      resultadoCompetenciaCentavos: x.receitaCompetenciaCentavos - x.custoCompetenciaCentavos,
      resultadoCaixaCentavos: x.receitaCaixaCentavos - x.custoCaixaCentavos,
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}
