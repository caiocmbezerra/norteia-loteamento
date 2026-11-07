import { describe, expect, it } from 'vitest'
import {
  Decimal,
  ErroDinheiro,
  ZERO,
  arredondarCentavos,
  centavos,
  deReais,
  emReais,
  negar,
  somar,
  subtrair,
} from './index'

describe('centavos', () => {
  it('aceita inteiros e bigint seguros', () => {
    expect(centavos(123)).toBe(123)
    expect(centavos(-5n)).toBe(-5)
    expect(ZERO).toBe(0)
  })

  it('normaliza -0 para 0', () => {
    expect(Object.is(centavos(-0), 0)).toBe(true)
  })

  it('recusa frações, infinitos e valores fora da faixa segura', () => {
    expect(() => centavos(1.5)).toThrow(ErroDinheiro)
    expect(() => centavos(Number.NaN)).toThrow(ErroDinheiro)
    expect(() => centavos(Number.POSITIVE_INFINITY)).toThrow(ErroDinheiro)
    expect(() => centavos(2n ** 60n)).toThrow(ErroDinheiro)
  })
})

describe('deReais', () => {
  it('converte reais em centavos', () => {
    expect(deReais('90000')).toBe(9_000_000)
    expect(deReais('0.1')).toBe(10)
    expect(deReais(new Decimal('1234.56'))).toBe(123_456)
    expect(deReais(7n)).toBe(700)
  })

  it('usa arredondamento meio-para-par por padrão', () => {
    expect(deReais('0.125')).toBe(12)
    expect(deReais('0.135')).toBe(14)
    expect(deReais('-0.125')).toBe(-12)
  })

  it('permite outro modo de arredondamento', () => {
    expect(deReais('0.125', Decimal.ROUND_HALF_UP)).toBe(13)
    expect(deReais('0.121', Decimal.ROUND_UP)).toBe(13)
  })

  it('recusa valores não finitos', () => {
    expect(() => deReais('Infinity')).toThrow(ErroDinheiro)
    expect(() => deReais('NaN')).toThrow(ErroDinheiro)
  })

  it('evita o erro clássico de ponto flutuante', () => {
    // 0.1 + 0.2 em float = 0.30000000000000004
    expect(somar(deReais('0.1'), deReais('0.2'))).toBe(30)
  })
})

describe('arredondarCentavos', () => {
  it('arredonda frações de centavo', () => {
    expect(arredondarCentavos('100.5')).toBe(100)
    expect(arredondarCentavos('101.5')).toBe(102)
    expect(arredondarCentavos('100.5', Decimal.ROUND_HALF_UP)).toBe(101)
  })
})

describe('operações', () => {
  it('soma, subtrai e nega', () => {
    const a = centavos(1_000)
    const b = centavos(250)
    expect(somar()).toBe(0)
    expect(somar(a, b, b)).toBe(1_500)
    expect(subtrair(a, b)).toBe(750)
    expect(negar(a)).toBe(-1_000)
    expect(Object.is(negar(ZERO), 0)).toBe(true)
  })

  it('recusa resultado fora da faixa segura', () => {
    const grande = centavos(Number.MAX_SAFE_INTEGER)
    expect(() => somar(grande, centavos(1))).toThrow(ErroDinheiro)
  })

  it('converte para reais sem perda', () => {
    expect(emReais(centavos(123_456)).toString()).toBe('1234.56')
  })
})
