import { Decimal } from './decimal'
import { type Centavos, centavos } from './dinheiro'
import { type RegraEncargos, calcularEncargos, diasEntre } from './encargos'
import { ErroMotor } from './fluxo'

/**
 * Desconto por antecipação (RN-K08): o saldo da parcela é trazido a valor presente pela taxa
 * do contrato, pro rata die (mês de 30 dias), da data do pagamento até o vencimento.
 * Parcela vencida ou paga no vencimento não tem desconto.
 */
export function descontoAntecipacao(
  saldo: Centavos,
  vencimento: string,
  pagamento: string,
  jurosMensal: Decimal,
): Centavos {
  if (jurosMensal.isNegative()) throw new ErroMotor('A taxa do contrato não pode ser negativa.')
  const dias = diasEntre(pagamento, vencimento)
  if (dias <= 0 || saldo <= 0 || jurosMensal.isZero()) return centavos(0)
  const fator = new Decimal(1).plus(jurosMensal).pow(new Decimal(dias).div(30))
  const presente = new Decimal(saldo).div(fator).toDecimalPlaces(0)
  return centavos(saldo - Number(presente.toFixed(0)))
}

export interface QuitacaoAntecipada {
  /** Soma dos saldos em aberto, sem desconto nem encargos. */
  saldoCentavos: Centavos
  /** Desconto das parcelas a vencer (valor presente à taxa do contrato). */
  descontoCentavos: Centavos
  /** Multa e juros de mora das parcelas vencidas até a data. */
  encargosCentavos: Centavos
  /** Valor para quitar tudo na data: saldo − desconto + encargos. */
  totalCentavos: Centavos
}

/**
 * Quanto custa quitar o contrato numa data (RN-K08 com RN-K04): parcelas a vencer trazidas a
 * valor presente pela taxa do contrato; vencidas com multa e juros de mora. É estimativa para o
 * comprador; a baixa usa as mesmas funções na data do pagamento.
 */
export function quitacaoAntecipada(
  parcelas: readonly { vencimento: string; saldoCentavos: Centavos }[],
  data: string,
  jurosMensal: Decimal,
  encargos: RegraEncargos,
): QuitacaoAntecipada {
  let saldo = 0
  let desconto = 0
  let mora = 0
  for (const p of parcelas) {
    if (p.saldoCentavos <= 0) continue
    saldo += p.saldoCentavos
    if (p.vencimento > data)
      desconto += descontoAntecipacao(p.saldoCentavos, p.vencimento, data, jurosMensal)
    else {
      const e = calcularEncargos(p.saldoCentavos, p.vencimento, data, encargos)
      mora += e.multa + e.jurosMora
    }
  }
  return {
    saldoCentavos: centavos(saldo),
    descontoCentavos: centavos(desconto),
    encargosCentavos: centavos(mora),
    totalCentavos: centavos(saldo - desconto + mora),
  }
}

export interface SimulacaoCessaoCarteira {
  nominalCentavos: Centavos
  presenteCentavos: Centavos
  desagioCentavos: Centavos
  parcelas: number
}

/**
 * Cessão de carteira: valor presente das parcelas em aberto à taxa de desconto do comprador
 * dos recebíveis (pro rata die, mês de 30 dias), descontada a perda esperada. Vencidas valem
 * o saldo (sem desconto de prazo).
 */
export function simularCessaoCarteira(
  parcelas: readonly { vencimento: string; saldoCentavos: Centavos }[],
  data: string,
  taxaMensal: Decimal,
  perdaEsperada: Decimal,
): SimulacaoCessaoCarteira {
  if (taxaMensal.isNegative() || perdaEsperada.isNegative() || perdaEsperada.gte(1))
    throw new ErroMotor('Taxa e perda esperada inválidas.')
  const fator = new Decimal(1).minus(perdaEsperada)
  let nominal = 0
  let presente = new Decimal(0)
  for (const p of parcelas) {
    nominal += p.saldoCentavos
    const dias = Math.max(0, diasEntre(data, p.vencimento))
    presente = presente.plus(
      new Decimal(p.saldoCentavos).div(
        new Decimal(1).plus(taxaMensal).pow(new Decimal(dias).div(30)),
      ),
    )
  }
  const vp = centavos(Number(presente.times(fator).toDecimalPlaces(0).toFixed(0)))
  return {
    nominalCentavos: centavos(nominal),
    presenteCentavos: vp,
    desagioCentavos: centavos(nominal - vp),
    parcelas: parcelas.length,
  }
}
