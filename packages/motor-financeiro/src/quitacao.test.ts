import { describe, expect, it } from 'vitest'
import { Decimal, centavos, descontoAntecipacao, quitacaoAntecipada } from './index'

const encargos = { multa: new Decimal('0.02'), jurosMoraMensal: new Decimal('0.01') }

describe('quitacaoAntecipada', () => {
  it('desconta as parcelas a vencer e soma os encargos das vencidas', () => {
    const r = quitacaoAntecipada(
      [
        // Vencida há 30 dias: 2% de multa (2.000) + 1% de juros (1.000)
        { vencimento: '2026-10-11', saldoCentavos: centavos(100_000) },
        // Vence hoje: sem desconto nem encargos
        { vencimento: '2026-11-10', saldoCentavos: centavos(100_000) },
        // Vence em 30 dias: valor presente a 1% a.m.
        { vencimento: '2026-12-10', saldoCentavos: centavos(101_000) },
        // Já paga: ignorada
        { vencimento: '2027-01-10', saldoCentavos: centavos(0) },
      ],
      '2026-11-10',
      new Decimal('0.01'),
      encargos,
    )
    expect(r.saldoCentavos).toBe(301_000)
    expect(r.encargosCentavos).toBe(3_000)
    expect(r.descontoCentavos).toBe(
      descontoAntecipacao(centavos(101_000), '2026-12-10', '2026-11-10', new Decimal('0.01')),
    )
    expect(r.descontoCentavos).toBe(1_000)
    expect(r.totalCentavos).toBe(301_000 - 1_000 + 3_000)
  })

  it('sem parcelas em aberto, nada a pagar', () => {
    expect(quitacaoAntecipada([], '2026-11-10', new Decimal('0.005'), encargos)).toEqual({
      saldoCentavos: 0,
      descontoCentavos: 0,
      encargosCentavos: 0,
      totalCentavos: 0,
    })
  })
})
