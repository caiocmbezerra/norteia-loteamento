import { Decimal, type ValorDecimal } from './decimal'

/**
 * IBS/CBS sobre a venda de um lote (reforma tributária, LC 214/2025): a base é o valor da venda
 * menos o redutor social (lote residencial), e as alíquotas são reduzidas no regime de imóveis.
 * Todos os números vêm dos parâmetros com vigência; aqui só a conta. // VALIDAR COM CONTADOR (PL-22)
 */
export interface EntradaIbsCbs {
  valorCentavos: number
  redutorSocialCentavos: number
  /** Fração de redução das alíquotas (0,5 = 50%). */
  reducao: ValorDecimal
  aliquotaCbs: ValorDecimal
  aliquotaIbs: ValorDecimal
}

export interface ResultadoIbsCbs {
  baseCentavos: number
  cbsCentavos: number
  ibsCentavos: number
  totalCentavos: number
  /** Total sobre o valor da venda (fração). */
  cargaEfetiva: string
}

const inteiro = (d: Decimal) => Number(d.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0))

export function ibsCbsSobreVenda(e: EntradaIbsCbs): ResultadoIbsCbs {
  const base = Math.max(0, e.valorCentavos - Math.max(0, e.redutorSocialCentavos))
  const fator = new Decimal(1).minus(e.reducao)
  const cbs = inteiro(new Decimal(base).times(e.aliquotaCbs).times(fator))
  const ibs = inteiro(new Decimal(base).times(e.aliquotaIbs).times(fator))
  const total = cbs + ibs
  return {
    baseCentavos: base,
    cbsCentavos: cbs,
    ibsCentavos: ibs,
    totalCentavos: total,
    cargaEfetiva:
      e.valorCentavos > 0
        ? new Decimal(total).div(e.valorCentavos).toDecimalPlaces(6).toString()
        : '0',
  }
}
