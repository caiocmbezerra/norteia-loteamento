import { Decimal } from './decimal'
import type { BaseMonetaria } from './fluxo'

/** Taxa mensal efetiva, como fração (0,012 = 1,2% a.m.), com a base monetária a que se refere. */
export interface Taxa {
  base: BaseMonetaria
  mensal: Decimal
}

/** RN-F05: (1 + mensal)^12 − 1. */
export function mensalParaAnual(mensal: Decimal): Decimal {
  return mensal.plus(1).pow(12).minus(1)
}

/** Inverso de mensalParaAnual: (1 + anual)^(1/12) − 1. */
export function anualParaMensal(anual: Decimal): Decimal {
  return anual.plus(1).pow(new Decimal(1).div(12)).minus(1)
}
