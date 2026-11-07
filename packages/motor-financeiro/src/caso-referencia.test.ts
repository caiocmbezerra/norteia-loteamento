import { describe, expect, it } from 'vitest'
import {
  CASO_REFERENCIA,
  Decimal,
  TMA_REFERENCIA,
  estressar,
  projetarViabilidade,
  resumirViabilidade,
} from './index'

/**
 * RN-F17 — Caso de referência obrigatório (docs/dominio.md §3). Este teste nunca pode ser
 * desativado: ele é a prova de que o motor calcula como a especificação manda.
 */

const reais = (centavos: Decimal) => centavos.div(100).toNumber()
const pp = (fracao: Decimal | null) => fracao!.times(100).toNumber()

function dentro(valor: number, esperado: number, tolerancia: number) {
  expect(
    Math.abs(valor - esperado),
    `${valor} vs ${esperado} (±${tolerancia})`,
  ).toBeLessThanOrEqual(tolerancia)
}

describe('caso de referência (RN-F17)', () => {
  const r = resumirViabilidade(projetarViabilidade(CASO_REFERENCIA), TMA_REFERENCIA)

  it('VGV vendido: R$ 9.180.000 (exato)', () => {
    expect(reais(r.vgvVendido)).toBe(9_180_000)
  })

  it('total recebido: R$ 11.154.525 (± R$ 1.000)', () => {
    dentro(reais(r.recebido), 11_154_525, 1_000)
  })

  it('custos sem tributos: R$ 4.893.000 (exato)', () => {
    expect(reais(r.custos)).toBe(4_893_000)
  })

  it('tributos: R$ 661.463 (± R$ 100)', () => {
    dentro(reais(r.tributos), 661_463, 100)
  })

  it('lucro nominal: R$ 5.600.062 (± R$ 1.000)', () => {
    dentro(reais(r.lucroNominal), 5_600_062, 1_000)
  })

  it('TIR mensal: 1,48% (± 0,01 p.p.) e anual: 19,3% (± 0,1 p.p.)', () => {
    dentro(pp(r.tir.mensal), 1.48, 0.01)
    dentro(pp(r.tir.anual), 19.3, 0.1)
    expect(r.tir.possivelTirMultipla).toBe(false)
  })

  it('VPL a 1,2% a.m.: R$ 515.116 (± R$ 1.000)', () => {
    dentro(reais(r.vpl), 515_116, 1_000)
  })

  it('exposição máxima: R$ 3.447.951 no mês 30 (± R$ 1.000)', () => {
    dentro(reais(r.exposicaoMaxima.valor), 3_447_951, 1_000)
    expect(r.exposicaoMaxima.mes).toBe(30)
  })

  it('payback simples no mês 76 e descontado no mês 115 (exatos)', () => {
    expect(r.paybackSimples).toBe(76)
    expect(r.paybackDescontado).toBe(115)
  })

  it('vendas: 4 lotes/mês do mês 13 ao 37 e 2 no mês 38', () => {
    const { vendasPorMes } = projetarViabilidade(CASO_REFERENCIA)
    expect(vendasPorMes.length).toBe(39)
    expect(vendasPorMes.slice(13, 38).every((q) => q === 4)).toBe(true)
    expect(vendasPorMes[38]).toBe(2)
  })

  it('separa receita imobiliária de receita de juros (RN-F12)', () => {
    expect(r.receitaJuros.isPositive()).toBe(true)
    expect(reais(r.recebido.minus(r.receitaJuros))).toBeLessThan(9_180_000)
  })

  it('necessidade de aporte soma exatamente a exposição máxima com caixa mínimo zero', () => {
    const total = r.necessidadeDeAporte.reduce((s, v) => s.plus(v), new Decimal(0))
    expect(total.minus(r.exposicaoMaxima.valor).abs().lt(1)).toBe(true)
  })
})

describe('testes de estresse do caso de referência (TIR anual)', () => {
  it.each([
    ['vendas de 2 lotes/mês', [{ tipo: 'velocidade_vendas', lotesPorMes: 2 }], 15.3],
    [
      'infraestrutura de R$ 3.450.000',
      [{ tipo: 'custo', centroCusto: 'infraestrutura', fator: new Decimal('1.15') }],
      16.6,
    ],
    ['inadimplência de 15%', [{ tipo: 'inadimplencia', fracao: new Decimal('0.15') }], 16.9],
    ['preço de R$ 81.000', [{ tipo: 'preco', fator: new Decimal('0.9') }], 16.2],
  ] as const)('%s → %s%%', (_, choques, esperado) => {
    const r = estressar(CASO_REFERENCIA, choques, TMA_REFERENCIA)
    dentro(pp(r.tir.anual), esperado, 0.1)
  })
})
