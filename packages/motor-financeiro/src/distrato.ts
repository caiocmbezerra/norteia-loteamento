import { Decimal } from './decimal'
import { type Centavos, centavos } from './dinheiro'
import { diasEntre, somarMeses } from './encargos'
import { ErroMotor } from './fluxo'

/** Regras do distrato — todas parâmetros do cliente/contrato (RN-D01, D-059). */
export interface RegrasDistrato {
  /** Cláusula penal + despesas administrativas, fração do valor atualizado do contrato. */
  clausulaPenal: Decimal
  /** Taxa de fruição ao mês, fração do valor atualizado do contrato, enquanto houve posse. */
  fruicaoMensal: Decimal
  /** Deduz os encargos moratórios pagos pelo comprador. */
  deduzEncargosMoratorios: boolean
  /** Deduz a comissão de corretagem paga. */
  deduzComissao: boolean
  /** Número de parcelas da devolução. */
  parcelasDevolucao: number
  /** Meses entre o distrato e a 1ª parcela da devolução. */
  carenciaMeses: number
}

export interface EntradaDistrato {
  data: string
  precoCentavos: Centavos
  /** Fator de correção do preço até a data do distrato (índice do contrato; 1 = sem correção). */
  fatorPreco: Decimal
  /** Recebimentos não estornados, cada um com o fator de correção até o distrato (RN-D02). */
  recebimentos: readonly { valorCentavos: Centavos; encargosCentavos: Centavos; fator: Decimal }[]
  /** Data de imissão na posse; nula = sem posse, sem fruição. */
  posseDesde: string | null
  comissaoPagaCentavos: Centavos
  /** Outros débitos do comprador (IPTU, contribuições), informados no distrato. */
  outrosDebitosCentavos: Centavos
  regras: RegrasDistrato
}

export interface ResultadoDistrato {
  pagoCentavos: Centavos
  pagoAtualizadoCentavos: Centavos
  valorContratoAtualizadoCentavos: Centavos
  mesesPosse: number
  deducoes: {
    clausulaPenal: Centavos
    fruicao: Centavos
    encargosMoratorios: Centavos
    comissao: Centavos
    outrosDebitos: Centavos
  }
  devolucaoCentavos: Centavos
  parcelas: { numero: number; vencimento: string; valorCentavos: Centavos }[]
}

const arredondar = (d: Decimal) => centavos(BigInt(d.toDecimalPlaces(0).toFixed(0)))

/**
 * Distrato (art. 32-A da Lei 6.766): devolve os valores pagos corrigidos, deduzidos cláusula
 * penal, fruição, encargos moratórios, comissão e outros débitos, conforme as regras; a
 * devolução nunca é negativa e é paga em parcelas iguais (o resíduo vai na última).
 */
export function calcularDistrato(e: EntradaDistrato): ResultadoDistrato {
  const r = e.regras
  if (
    r.clausulaPenal.isNegative() ||
    r.fruicaoMensal.isNegative() ||
    !Number.isInteger(r.parcelasDevolucao) ||
    r.parcelasDevolucao < 1 ||
    !Number.isInteger(r.carenciaMeses) ||
    r.carenciaMeses < 0
  ) {
    throw new ErroMotor('Regras de distrato inválidas.')
  }
  const pago = e.recebimentos.reduce((t, x) => t + x.valorCentavos, 0)
  const pagoAtualizado = e.recebimentos.reduce(
    (t, x) => t.plus(new Decimal(x.valorCentavos).times(x.fator)),
    new Decimal(0),
  )
  const valorContrato = new Decimal(e.precoCentavos).times(e.fatorPreco)
  const mesesPosse = e.posseDesde
    ? Math.max(0, Math.floor(diasEntre(e.posseDesde, e.data) / 30))
    : 0

  const deducoes = {
    clausulaPenal: arredondar(valorContrato.times(r.clausulaPenal)),
    fruicao: arredondar(valorContrato.times(r.fruicaoMensal).times(mesesPosse)),
    encargosMoratorios: centavos(
      r.deduzEncargosMoratorios ? e.recebimentos.reduce((t, x) => t + x.encargosCentavos, 0) : 0,
    ),
    comissao: centavos(r.deduzComissao ? e.comissaoPagaCentavos : 0),
    outrosDebitos: e.outrosDebitosCentavos,
  }
  const totalDeducoes = Object.values(deducoes).reduce((t: number, x) => t + x, 0)
  const devolucao = centavos(Math.max(0, Number(arredondar(pagoAtualizado)) - totalDeducoes))

  const base = Math.floor(devolucao / r.parcelasDevolucao)
  const parcelas =
    devolucao === 0
      ? []
      : Array.from({ length: r.parcelasDevolucao }, (_, i) => ({
          numero: i + 1,
          vencimento: somarMeses(e.data, r.carenciaMeses + i),
          valorCentavos: centavos(
            i === r.parcelasDevolucao - 1 ? devolucao - base * (r.parcelasDevolucao - 1) : base,
          ),
        }))
  return {
    pagoCentavos: centavos(pago),
    pagoAtualizadoCentavos: arredondar(pagoAtualizado),
    valorContratoAtualizadoCentavos: arredondar(valorContrato),
    mesesPosse,
    deducoes,
    devolucaoCentavos: devolucao,
    parcelas,
  }
}

/** Fator acumulado de variações mensais em % (0,39 = 0,39%). */
export function fatorAcumulado(variacoesPercentuais: readonly Decimal[]): Decimal {
  return variacoesPercentuais.reduce(
    (f, v) => f.times(new Decimal(1).plus(v.div(100))),
    new Decimal(1),
  )
}
