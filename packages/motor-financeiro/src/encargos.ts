import { Decimal } from './decimal'
import { type Centavos, centavos } from './dinheiro'
import { ErroMotor } from './fluxo'

/**
 * Encargos de mora sobre parcela paga em atraso (RN-K04). Os percentuais vêm sempre dos
 * parâmetros do contrato/empresa — nunca do código. // VALIDAR COM ADVOGADO (PL-04)
 */
export interface RegraEncargos {
  /** Multa única, como fração do valor em atraso (0,02 = 2%). */
  multa: Decimal
  /** Juros de mora ao mês, como fração, proporcional aos dias (juros simples, mês de 30 dias). */
  jurosMoraMensal: Decimal
}

export interface Encargos {
  diasAtraso: number
  multa: Centavos
  jurosMora: Centavos
  /** Valor em atraso + multa + juros de mora. */
  total: Centavos
}

function diaJuliano(data: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  if (!m) throw new ErroMotor(`Data inválida: ${data}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
}

/** Dias corridos entre duas datas AAAA-MM-DD (negativo se `ate` vem antes de `de`). */
export function diasEntre(de: string, ate: string): number {
  return diaJuliano(ate) - diaJuliano(de)
}

export function calcularEncargos(
  valorEmAtraso: Centavos,
  vencimento: string,
  pagamento: string,
  regra: RegraEncargos,
): Encargos {
  if (regra.multa.isNegative() || regra.jurosMoraMensal.isNegative()) {
    throw new ErroMotor('Multa e juros de mora não podem ser negativos.')
  }
  const dias = Math.max(0, diasEntre(vencimento, pagamento))
  if (dias === 0 || valorEmAtraso <= 0) {
    return { diasAtraso: dias, multa: centavos(0), jurosMora: centavos(0), total: valorEmAtraso }
  }
  const valor = new Decimal(valorEmAtraso)
  const multa = centavos(BigInt(valor.times(regra.multa).toDecimalPlaces(0).toFixed(0)))
  const jurosMora = centavos(
    BigInt(valor.times(regra.jurosMoraMensal).times(dias).div(30).toDecimalPlaces(0).toFixed(0)),
  )
  return { diasAtraso: dias, multa, jurosMora, total: centavos(valorEmAtraso + multa + jurosMora) }
}

/** Soma N meses a uma data, mantendo o dia (ou o último dia do mês, se não existir). */
export function somarMeses(data: string, meses: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  if (!m || !Number.isInteger(meses))
    throw new ErroMotor(`Data ou meses inválidos: ${data} + ${meses}`)
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + meses
  const ano = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const dia = Math.min(Number(m[3]), ultimo)
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}
