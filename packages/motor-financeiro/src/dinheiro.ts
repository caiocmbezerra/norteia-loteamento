import { type Arredondamento, Decimal, type ValorDecimal } from './decimal'

declare const marcaCentavos: unique symbol

/**
 * Valor monetário em centavos de real, sempre inteiro (RN-G05).
 * O tipo marcado impede somar centavos com taxas ou números soltos por engano.
 */
export type Centavos = number & { readonly [marcaCentavos]: true }

export class ErroDinheiro extends Error {
  override readonly name = 'ErroDinheiro'
}

/** Converte um inteiro em `Centavos`, recusando frações e valores fora da faixa segura. */
export function centavos(valor: number | bigint): Centavos {
  const n = typeof valor === 'bigint' ? Number(valor) : valor
  if (!Number.isSafeInteger(n) || (typeof valor === 'bigint' && BigInt(n) !== valor)) {
    throw new ErroDinheiro(`Valor em centavos inválido: ${String(valor)}`)
  }
  // Normaliza -0 para 0.
  return (n === 0 ? 0 : n) as Centavos
}

export const ZERO: Centavos = centavos(0)

/** Arredonda um valor em reais para centavos (meio-para-par por padrão). */
export function deReais(
  reais: ValorDecimal,
  arredondamento: Arredondamento = Decimal.ROUND_HALF_EVEN,
): Centavos {
  const d = new Decimal(reais)
  if (!d.isFinite()) {
    throw new ErroDinheiro(`Valor em reais inválido: ${String(reais)}`)
  }
  return centavos(BigInt(d.times(100).toDecimalPlaces(0, arredondamento).toFixed(0)))
}

/** Arredonda um valor já expresso em centavos (com frações) para centavos inteiros. */
export function arredondarCentavos(
  valor: ValorDecimal,
  arredondamento: Arredondamento = Decimal.ROUND_HALF_EVEN,
): Centavos {
  return deReais(new Decimal(valor).div(100), arredondamento)
}

/** Valor em reais como Decimal, para cálculos intermediários sem perda. */
export function emReais(valor: Centavos): Decimal {
  return new Decimal(valor).div(100)
}

export function somar(...valores: Centavos[]): Centavos {
  return centavos(valores.reduce((acc, v) => acc + BigInt(v), 0n))
}

export function subtrair(a: Centavos, b: Centavos): Centavos {
  return centavos(BigInt(a) - BigInt(b))
}

export function negar(valor: Centavos): Centavos {
  return centavos(-valor)
}
