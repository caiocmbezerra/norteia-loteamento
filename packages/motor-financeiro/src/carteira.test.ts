import { describe, expect, it } from 'vitest'
import {
  Decimal,
  ErroMotor,
  calcularEncargos,
  centavos,
  diasEntre,
  gerarParcelasContrato,
  somarMeses,
} from './index'

const regra = { multa: new Decimal('0.02'), jurosMoraMensal: new Decimal('0.01') }

describe('somarMeses', () => {
  it('mantém o dia e ajusta ao fim do mês', () => {
    expect(somarMeses('2026-01-15', 1)).toBe('2026-02-15')
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(somarMeses('2026-11-30', 14)).toBe('2028-01-30')
    expect(somarMeses('2026-03-10', -3)).toBe('2025-12-10')
  })

  it('recusa entradas inválidas', () => {
    expect(() => somarMeses('2026-1-1', 1)).toThrow(ErroMotor)
    expect(() => somarMeses('2026-01-01', 1.5)).toThrow(ErroMotor)
  })
})

describe('diasEntre', () => {
  it('conta dias corridos', () => {
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1)
    expect(diasEntre('2026-03-01', '2026-02-28')).toBe(-1)
    expect(() => diasEntre('ontem', '2026-01-01')).toThrow(ErroMotor)
  })
})

describe('calcularEncargos (RN-K04)', () => {
  it('sem atraso não há encargos', () => {
    expect(calcularEncargos(centavos(100_000), '2026-05-10', '2026-05-10', regra)).toEqual({
      diasAtraso: 0,
      multa: 0,
      jurosMora: 0,
      total: 100_000,
    })
    expect(calcularEncargos(centavos(100_000), '2026-05-10', '2026-05-01', regra).total).toBe(
      100_000,
    )
    expect(calcularEncargos(centavos(0), '2026-05-10', '2026-06-10', regra).total).toBe(0)
  })

  it('multa única e juros pro rata die', () => {
    // R$ 1.000,00, 15 dias: multa 20,00; juros 1.000 × 1% × 15/30 = 5,00
    expect(calcularEncargos(centavos(100_000), '2026-05-10', '2026-05-25', regra)).toEqual({
      diasAtraso: 15,
      multa: 2_000,
      jurosMora: 500,
      total: 102_500,
    })
    // arredondamento ao centavo: 1.234,57 × 1% × 7/30 = 2,8806…
    expect(calcularEncargos(centavos(123_457), '2026-05-10', '2026-05-17', regra).jurosMora).toBe(
      288,
    )
  })

  it('recusa percentuais negativos', () => {
    expect(() =>
      calcularEncargos(centavos(1), '2026-01-01', '2026-02-01', {
        ...regra,
        multa: new Decimal(-1),
      }),
    ).toThrow(ErroMotor)
  })
})

describe('gerarParcelasContrato (RN-K01, RN-K02)', () => {
  const base = {
    precoCentavos: centavos(9_000_000),
    entradaCentavos: centavos(900_000),
    dataEntrada: '2026-11-08',
    parcelas: 120,
    jurosMensal: new Decimal('0.01'),
    sistema: 'price' as const,
    primeiraParcelaEm: '2026-12-08',
  }

  it('entrada + amortizações = preço, em centavos inteiros', () => {
    const lista = gerarParcelasContrato(base)
    expect(lista).toHaveLength(121)
    expect(lista[0]).toEqual({
      numero: 0,
      vencimento: '2026-11-08',
      valor: 900_000,
      amortizacao: 900_000,
      juros: 0,
    })
    expect(lista[1]!.vencimento).toBe('2026-12-08')
    expect(lista[120]!.vencimento).toBe('2036-11-08')
    expect(lista.reduce((s, p) => s + p.amortizacao, 0)).toBe(9_000_000)
    for (const p of lista) {
      expect(Number.isInteger(p.valor)).toBe(true)
      expect(p.valor).toBe(p.amortizacao + p.juros)
    }
    expect(lista[1]!.valor).toBe(116_211)
  })

  it('SAC sem entrada e venda à vista', () => {
    const sac = gerarParcelasContrato({ ...base, entradaCentavos: centavos(0), sistema: 'sac' })
    expect(sac[0]!.numero).toBe(1)
    expect(sac.reduce((s, p) => s + p.amortizacao, 0)).toBe(9_000_000)
    const vista = gerarParcelasContrato({
      ...base,
      entradaCentavos: base.precoCentavos,
      parcelas: 0,
      primeiraParcelaEm: null,
    })
    expect(vista).toHaveLength(1)
  })

  it('recusa condições inconsistentes', () => {
    expect(() => gerarParcelasContrato({ ...base, entradaCentavos: centavos(-1) })).toThrow(
      ErroMotor,
    )
    expect(() => gerarParcelasContrato({ ...base, entradaCentavos: centavos(9_000_001) })).toThrow(
      ErroMotor,
    )
    expect(() => gerarParcelasContrato({ ...base, parcelas: 0 })).toThrow(ErroMotor)
    expect(() => gerarParcelasContrato({ ...base, primeiraParcelaEm: null })).toThrow(ErroMotor)
  })
})
