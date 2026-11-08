import { Decimal } from './decimal'
import { type Centavos, centavos } from './dinheiro'
import { diasEntre } from './encargos'
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
