import { describe, expect, it } from 'vitest'
import { Decimal, ErroMotor, calcularDistrato, centavos, fatorAcumulado } from './index'

const regras = {
  clausulaPenal: new Decimal('0.10'),
  fruicaoMensal: new Decimal('0.0075'),
  deduzEncargosMoratorios: true,
  deduzComissao: false,
  parcelasDevolucao: 12,
  carenciaMeses: 12,
}
// Lote de R$ 90.000,00; pagos R$ 9.000,00 de entrada + 10 parcelas de R$ 900,00 (R$ 50 de encargos em uma)
const base = {
  data: '2026-11-08',
  precoCentavos: centavos(9_000_000),
  fatorPreco: new Decimal(1),
  recebimentos: [
    { valorCentavos: centavos(900_000), encargosCentavos: centavos(0), fator: new Decimal(1) },
    ...Array.from({ length: 10 }, (_, i) => ({
      valorCentavos: centavos(i === 0 ? 95_000 : 90_000),
      encargosCentavos: centavos(i === 0 ? 5_000 : 0),
      fator: new Decimal(1),
    })),
  ],
  posseDesde: null,
  comissaoPagaCentavos: centavos(450_000),
  outrosDebitosCentavos: centavos(0),
  regras,
}

describe('calcularDistrato (RN-D01 a RN-D03)', () => {
  it('cálculo independente: pago 18.050 − 10% de 90.000 − encargos 50 = 8.000 em 12 parcelas', () => {
    const r = calcularDistrato(base)
    expect(r.pagoCentavos).toBe(1_805_000)
    expect(r.deducoes).toEqual({
      clausulaPenal: 900_000,
      fruicao: 0,
      encargosMoratorios: 5_000,
      comissao: 0,
      outrosDebitos: 0,
    })
    expect(r.devolucaoCentavos).toBe(900_000)
    expect(r.parcelas).toHaveLength(12)
    expect(r.parcelas[0]).toEqual({ numero: 1, vencimento: '2027-11-08', valorCentavos: 75_000 })
    expect(r.parcelas.reduce((t, p) => t + p.valorCentavos, 0)).toBe(r.devolucaoCentavos)
  })

  it('corrige pagamentos e preço pelo índice, deduz fruição pela posse e comissão', () => {
    const r = calcularDistrato({
      ...base,
      fatorPreco: new Decimal('1.05'),
      recebimentos: [
        {
          valorCentavos: centavos(2_000_000),
          encargosCentavos: centavos(0),
          fator: new Decimal('1.05'),
        },
      ],
      posseDesde: '2026-05-08', // 184 dias → 6 meses
      outrosDebitosCentavos: centavos(10_000),
      regras: { ...regras, deduzComissao: true, parcelasDevolucao: 3, carenciaMeses: 0 },
    })
    expect(r.pagoAtualizadoCentavos).toBe(2_100_000)
    expect(r.valorContratoAtualizadoCentavos).toBe(9_450_000)
    expect(r.mesesPosse).toBe(6)
    expect(r.deducoes.fruicao).toBe(425_250) // 94.500 × 0,75% × 6
    expect(r.deducoes.comissao).toBe(450_000)
    // 21.000 − 9.450 − 4.252,50 − 4.500 − 100 = 2.697,50 → 3 parcelas, resíduo na última
    expect(r.devolucaoCentavos).toBe(269_750)
    expect(r.parcelas.map((p) => p.valorCentavos)).toEqual([89_916, 89_916, 89_918])
    expect(r.parcelas[0]!.vencimento).toBe('2026-11-08')
  })

  it('devolução nunca é negativa; regras inválidas são recusadas', () => {
    const r = calcularDistrato({ ...base, recebimentos: base.recebimentos.slice(0, 1) })
    expect(r.devolucaoCentavos).toBe(0)
    expect(r.parcelas).toEqual([])
    expect(() =>
      calcularDistrato({ ...base, regras: { ...regras, parcelasDevolucao: 0 } }),
    ).toThrow(ErroMotor)
    expect(() =>
      calcularDistrato({ ...base, regras: { ...regras, clausulaPenal: new Decimal(-1) } }),
    ).toThrow(ErroMotor)
    expect(() =>
      calcularDistrato({ ...base, regras: { ...regras, fruicaoMensal: new Decimal(-1) } }),
    ).toThrow(ErroMotor)
    expect(() => calcularDistrato({ ...base, regras: { ...regras, carenciaMeses: -1 } })).toThrow(
      ErroMotor,
    )
    expect(() => calcularDistrato({ ...base, regras: { ...regras, carenciaMeses: 1.5 } })).toThrow(
      ErroMotor,
    )
    expect(calcularDistrato({ ...base, posseDesde: '2027-01-01' }).mesesPosse).toBe(0)
    const semEncargos = calcularDistrato({
      ...base,
      regras: { ...regras, deduzEncargosMoratorios: false },
    })
    expect(semEncargos.deducoes.encargosMoratorios).toBe(0)
    expect(semEncargos.devolucaoCentavos).toBe(905_000)
  })

  it('fator acumulado de variações mensais', () => {
    expect(fatorAcumulado([new Decimal('0.5'), new Decimal('0.5')]).toString()).toBe('1.010025')
    expect(fatorAcumulado([]).toString()).toBe('1')
  })
})
