import { describe, expect, it } from 'vitest'
import { ibsCbsSobreVenda } from './reforma'

describe('IBS/CBS sobre a venda de lote', () => {
  it('aplica redutor social e redução de alíquota', () => {
    // R$ 90.000 − R$ 30.000 = R$ 60.000 de base; 2026: CBS 0,9% e IBS 0,1%, com 50% de redução.
    expect(
      ibsCbsSobreVenda({
        valorCentavos: 9_000_000,
        redutorSocialCentavos: 3_000_000,
        reducao: '0.5',
        aliquotaCbs: '0.009',
        aliquotaIbs: '0.001',
      }),
    ).toEqual({
      baseCentavos: 6_000_000,
      cbsCentavos: 27_000,
      ibsCentavos: 3_000,
      totalCentavos: 30_000,
      cargaEfetiva: '0.003333',
    })
  })

  it('base não fica negativa e venda zero não divide por zero', () => {
    const r = ibsCbsSobreVenda({
      valorCentavos: 0,
      redutorSocialCentavos: 3_000_000,
      reducao: '0.5',
      aliquotaCbs: '0.088',
      aliquotaIbs: '0.177',
    })
    expect(r).toEqual({
      baseCentavos: 0,
      cbsCentavos: 0,
      ibsCentavos: 0,
      totalCentavos: 0,
      cargaEfetiva: '0',
    })
    expect(
      ibsCbsSobreVenda({
        valorCentavos: 100,
        redutorSocialCentavos: -5,
        reducao: '0',
        aliquotaCbs: '0.1',
        aliquotaIbs: '0',
      }).baseCentavos,
    ).toBe(100)
  })
})
