import { Decimal, type Lancamento } from '@norteia/motor-financeiro'
import { mesDoFluxo } from './datas'

/**
 * Projeção de custos a partir dos fatos (Fase 3, RN-F01, RN-F03).
 *
 * - **Realizado**: pagamentos não estornados, no mês do pagamento.
 * - **Comprometido**: saldo das contas a pagar abertas (no vencimento, nunca antes do mês atual)
 *   e saldo dos contratos vigentes ainda não faturado (distribuído até o fim previsto).
 * - **Projetado**: o que falta do orçamento revisado, distribuído nos meses restantes do orçamento.
 *
 * Sem dupla contagem: por centro de orçamento, orçado = realizado + comprometido + projetado
 * (exceto quando há estouro, em que projetado = 0 e o excedente é informado).
 * Um gasto num subcentro (infraestrutura.drenagem) consome o orçamento do centro orçado mais
 * próximo na hierarquia (infraestrutura).
 */

export interface ItemOrcamento {
  centro: string
  tipo: 'total' | 'mensal'
  valorCentavos: number
  mesInicio: number
  mesFim: number
}

export interface ContratoCusto {
  id: string
  centro: string
  valorCentavos: number
  dataInicio: string
  dataFimPrevista: string
  situacao: 'vigente' | 'encerrado' | 'cancelado'
}

export interface ContaCusto {
  id: string
  centro: string
  contratoId: string | null
  valorCentavos: number
  vencimento: string
  cancelada: boolean
}

export interface PagamentoCusto {
  contaId: string
  data: string
  valorCentavos: number
  estornado: boolean
}

export interface EntradaCustos {
  /** Mês 0 do empreendimento (AAAA-MM-01). */
  dataBase: string
  /** Data de referência (AAAA-MM-DD), informada por quem chama. */
  hoje: string
  orcamento: readonly ItemOrcamento[]
  contratos: readonly ContratoCusto[]
  contas: readonly ContaCusto[]
  pagamentos: readonly PagamentoCusto[]
}

export interface CustoPorCentro {
  /** Centro do orçamento (ou o próprio centro do gasto, se não orçado). */
  centro: string
  orcado: Decimal
  realizado: Decimal
  comprometido: Decimal
  projetado: Decimal
  /** realizado + comprometido + projetado */
  custoFinal: Decimal
  /** Quanto o realizado + comprometido passou do orçado (zero se dentro). */
  estouro: Decimal
}

export interface ProjecaoCustos {
  mesAtual: number
  lancamentos: Lancamento[]
  porCentro: CustoPorCentro[]
  total: Omit<CustoPorCentro, 'centro'>
}

const ZERO = new Decimal(0)

/** Centro orçado mais próximo na hierarquia de códigos (a.b.c → a.b → a). */
export function centroDeOrcamento(centro: string, orcados: ReadonlySet<string>): string {
  let atual = centro
  for (;;) {
    if (orcados.has(atual)) return atual
    const i = atual.lastIndexOf('.')
    if (i < 0) return centro
    atual = atual.slice(0, i)
  }
}

export function projetarCustos(e: EntradaCustos): ProjecaoCustos {
  const mesAtual = mesDoFluxo(e.dataBase, e.hoje)
  const orcados = new Set(e.orcamento.map((i) => i.centro))
  const lancamentos: Lancamento[] = []
  const porCentro = new Map<
    string,
    { orcado: Decimal; realizado: Decimal; comprometido: Decimal }
  >()
  const acumular = (
    centro: string,
    campo: 'orcado' | 'realizado' | 'comprometido',
    valor: Decimal,
  ) => {
    const chave = centroDeOrcamento(centro, orcados)
    const c = porCentro.get(chave) ?? { orcado: ZERO, realizado: ZERO, comprometido: ZERO }
    c[campo] = c[campo].plus(valor)
    porCentro.set(chave, c)
  }
  const lancar = (
    mes: number,
    valor: Decimal,
    natureza: Lancamento['natureza'],
    centro: string,
  ) => {
    if (!valor.isZero())
      lancamentos.push({
        mes,
        valor: valor.negated(),
        categoria: 'custo',
        natureza,
        centroCusto: centro,
      })
  }

  // Orçamento
  for (const i of e.orcamento) {
    const meses = i.mesFim - i.mesInicio + 1
    acumular(
      i.centro,
      'orcado',
      new Decimal(i.valorCentavos).times(i.tipo === 'mensal' ? meses : 1),
    )
  }

  // Realizado
  const contas = new Map(e.contas.map((c) => [c.id, c]))
  const pagoPorConta = new Map<string, Decimal>()
  for (const p of e.pagamentos) {
    const conta = contas.get(p.contaId)
    if (p.estornado || !conta) continue
    const v = new Decimal(p.valorCentavos)
    pagoPorConta.set(p.contaId, (pagoPorConta.get(p.contaId) ?? ZERO).plus(v))
    lancar(mesDoFluxo(e.dataBase, p.data), v, 'realizado', conta.centro)
    acumular(conta.centro, 'realizado', v)
  }

  // Comprometido: contas abertas
  const faturadoPorContrato = new Map<string, Decimal>()
  for (const c of e.contas) {
    if (c.cancelada) continue
    if (c.contratoId) {
      faturadoPorContrato.set(
        c.contratoId,
        (faturadoPorContrato.get(c.contratoId) ?? ZERO).plus(c.valorCentavos),
      )
    }
    const saldo = new Decimal(c.valorCentavos).minus(pagoPorConta.get(c.id) ?? ZERO)
    if (saldo.isPositive() && !saldo.isZero()) {
      lancar(
        Math.max(mesDoFluxo(e.dataBase, c.vencimento), mesAtual),
        saldo,
        'comprometido',
        c.centro,
      )
      acumular(c.centro, 'comprometido', saldo)
    }
  }

  // Comprometido: saldo não faturado dos contratos vigentes
  for (const k of e.contratos) {
    if (k.situacao !== 'vigente') continue
    const saldo = new Decimal(k.valorCentavos).minus(faturadoPorContrato.get(k.id) ?? ZERO)
    if (!saldo.isPositive() || saldo.isZero()) continue
    const inicio = Math.max(mesDoFluxo(e.dataBase, k.dataInicio), mesAtual)
    const fim = Math.max(mesDoFluxo(e.dataBase, k.dataFimPrevista), inicio)
    const parcela = saldo.div(fim - inicio + 1)
    for (let m = inicio; m <= fim; m++) lancar(m, parcela, 'comprometido', k.centro)
    acumular(k.centro, 'comprometido', saldo)
  }

  // Projetado: o que falta do orçamento, nos meses restantes de cada centro
  const resultado: CustoPorCentro[] = []
  for (const [centro, c] of [...porCentro.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const considerado = c.realizado.plus(c.comprometido)
    const falta = c.orcado.minus(considerado)
    const projetado = falta.isPositive() ? falta : ZERO
    if (!projetado.isZero()) {
      const meses = new Set<number>()
      for (const i of e.orcamento) {
        if (i.centro !== centro) continue
        for (let m = Math.max(i.mesInicio, mesAtual); m <= i.mesFim; m++) meses.add(m)
      }
      if (meses.size === 0) meses.add(mesAtual)
      const parcela = projetado.div(meses.size)
      for (const m of [...meses].sort((a, b) => a - b)) lancar(m, parcela, 'projetado', centro)
    }
    resultado.push({
      centro,
      orcado: c.orcado,
      realizado: c.realizado,
      comprometido: c.comprometido,
      projetado,
      custoFinal: considerado.plus(projetado),
      estouro: falta.isNegative() ? falta.negated() : ZERO,
    })
  }

  const somar = (campo: keyof Omit<CustoPorCentro, 'centro'>) =>
    resultado.reduce((s, r) => s.plus(r[campo]), ZERO)
  return {
    mesAtual,
    lancamentos,
    porCentro: resultado,
    total: {
      orcado: somar('orcado'),
      realizado: somar('realizado'),
      comprometido: somar('comprometido'),
      projetado: somar('projetado'),
      custoFinal: somar('custoFinal'),
      estouro: somar('estouro'),
    },
  }
}
