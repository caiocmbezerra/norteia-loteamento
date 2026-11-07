import { describe, expect, it } from 'vitest'
import { resumirLotes } from './index'

describe('resumirLotes', () => {
  it('conta por status, soma área e VGV de tabela sem os lotes de permuta', () => {
    const r = resumirLotes([
      { status: 'disponivel', area_m2: '300.00', preco_base_centavos: 9_000_000 },
      { status: 'disponivel', area_m2: 312.5, preco_base_centavos: 9_500_000 },
      { status: 'bloqueado', area_m2: '250', preco_base_centavos: null },
      { status: 'permuta', area_m2: '300.10', preco_base_centavos: 9_000_000 },
    ])
    expect(r.total).toBe(4)
    expect(r.porStatus).toEqual({
      disponivel: 2,
      reservado: 0,
      vendido: 0,
      bloqueado: 1,
      permuta: 1,
    })
    expect(r.areaM2).toBe('1162.60')
    expect(r.vgvTabelaCentavos).toBe(18_500_000)
    expect(r.lotesSemPreco).toBe(1)
  })

  it('lista vazia', () => {
    const r = resumirLotes([])
    expect(r).toMatchObject({ total: 0, areaM2: '0.00', vgvTabelaCentavos: 0, lotesSemPreco: 0 })
  })
})
