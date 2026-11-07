import DecimalBase from 'decimal.js'

/**
 * Decimal com precisão fixa para todo cálculo financeiro do motor (RN-G05).
 * 34 dígitos significativos (equivalente ao decimal128) e arredondamento
 * bancário (meio-para-par) como padrão.
 */
export const Decimal = DecimalBase.clone({
  precision: 34,
  rounding: DecimalBase.ROUND_HALF_EVEN,
})

export type Decimal = InstanceType<typeof Decimal>

/** Valores aceitos para construir um Decimal. Nunca use `number` com casas decimais para dinheiro. */
export type ValorDecimal = Decimal | string | bigint

/** Modo de arredondamento do decimal.js (ex.: `Decimal.ROUND_HALF_EVEN`). */
export type Arredondamento = DecimalBase.Rounding
