import { Decimal } from './decimal'
import { ErroMotor } from './fluxo'

export type SistemaAmortizacao = 'price' | 'sac'

export interface Parcela {
  numero: number
  prestacao: Decimal
  juros: Decimal
  amortizacao: Decimal
  saldoDevedor: Decimal
}

export interface OpcoesAmortizacao {
  /**
   * Arredonda cada parcela a centavos (contratos, RN-K02): a diferença de arredondamento
   * vai para a última parcela, e a soma das amortizações fecha exatamente com o principal.
   * Sem arredondamento: valores exatos, para projeções.
   */
  arredondarCentavos?: boolean
}

/** Tabela de amortização. `principal` em centavos; `taxaMensal` como fração. */
export function tabelaAmortizacao(
  sistema: SistemaAmortizacao,
  principal: Decimal,
  taxaMensal: Decimal,
  numeroParcelas: number,
  opcoes: OpcoesAmortizacao = {},
): Parcela[] {
  if (!Number.isInteger(numeroParcelas) || numeroParcelas < 1) {
    throw new ErroMotor('O número de parcelas deve ser um inteiro positivo.')
  }
  if (principal.isNegative() || taxaMensal.isNegative()) {
    throw new ErroMotor('Principal e taxa não podem ser negativos.')
  }
  const arredondar = opcoes.arredondarCentavos ?? false
  const r = (v: Decimal) => (arredondar ? v.toDecimalPlaces(0) : v)

  const prestacaoPrice = taxaMensal.isZero()
    ? principal.div(numeroParcelas)
    : principal.times(taxaMensal).div(new Decimal(1).minus(taxaMensal.plus(1).pow(-numeroParcelas)))
  const amortizacaoSac = principal.div(numeroParcelas)

  const parcelas: Parcela[] = []
  let saldo = principal
  for (let k = 1; k <= numeroParcelas; k++) {
    const juros = r(saldo.times(taxaMensal))
    let amortizacao = sistema === 'price' ? r(prestacaoPrice).minus(juros) : r(amortizacaoSac)
    if (k === numeroParcelas) amortizacao = saldo // fecha o saldo (RN-K02)
    saldo = saldo.minus(amortizacao)
    parcelas.push({
      numero: k,
      prestacao: amortizacao.plus(juros),
      juros,
      amortizacao,
      saldoDevedor: saldo,
    })
  }
  return parcelas
}
