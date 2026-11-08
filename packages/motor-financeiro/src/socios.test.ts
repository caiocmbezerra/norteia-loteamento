import { describe, expect, it } from 'vitest'
import { Decimal, ErroMotor, SEM_SOCIO, ratearPorSocio } from './index'

const d = (v: string | number) => new Decimal(v)

describe('ratearPorSocio (RN-S01)', () => {
  it('rateia pela participação vigente na data de cada lançamento', () => {
    const r = ratearPorSocio(
      [
        { data: '2026-01-15', valor: d(-1000) },
        { data: '2026-07-15', valor: d(3000) },
      ],
      [
        { socio: 'ana', percentual: d('0.6'), inicio: '2026-01-01', fim: '2026-07-01' },
        { socio: 'bia', percentual: d('0.4'), inicio: '2026-01-01', fim: null },
        { socio: 'ana', percentual: d('0.3'), inicio: '2026-07-01', fim: null },
        { socio: 'caio', percentual: d('0.3'), inicio: '2026-07-01', fim: null },
      ],
    )
    expect(r.get('ana')!.toString()).toBe(String(-600 + 900))
    expect(r.get('bia')!.toString()).toBe(String(-400 + 1200))
    expect(r.get('caio')!.toString()).toBe('900')
    expect(r.has(SEM_SOCIO)).toBe(false)
  })

  it('propriedade: a soma por sócio é exatamente o resultado da SPE', () => {
    let semente = 42
    const aleatorio = () => (semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    for (let caso = 0; caso < 200; caso++) {
      const valores = Array.from({ length: 1 + Math.floor(aleatorio() * 40) }, () => ({
        data: `2026-${String(1 + Math.floor(aleatorio() * 12)).padStart(2, '0')}-10`,
        valor: d((aleatorio() * 2e6 - 1e6).toFixed(2)),
      }))
      const n = 1 + Math.floor(aleatorio() * 5)
      const pesos = Array.from({ length: n }, () => aleatorio() + 0.01)
      const soma = pesos.reduce((a, b) => a + b, 0)
      const fatias = pesos.map((p) => d(p).div(soma).toDecimalPlaces(6, Decimal.ROUND_DOWN))
      const participacoes = fatias.map((pct, i) => ({
        socio: `s${i}`,
        percentual: pct,
        inicio: '2026-01-01',
        fim: null,
      }))
      const r = ratearPorSocio(valores, participacoes)
      const total = valores.reduce((t, v) => t.plus(v.valor), d(0))
      const rateado = [...r.values()].reduce((t, v) => t.plus(v), d(0))
      expect(rateado.minus(total).abs().lt('1e-20')).toBe(true)
    }
  })

  it('sem sócio vigente vai para SEM_SOCIO; participações inválidas são recusadas', () => {
    const r = ratearPorSocio(
      [{ data: '2025-12-01', valor: d(100) }],
      [{ socio: 'ana', percentual: d('0.5'), inicio: '2026-01-01', fim: null }],
    )
    expect(r.get(SEM_SOCIO)!.toString()).toBe('100')
    expect(() =>
      ratearPorSocio([], [{ socio: 'x', percentual: d(2), inicio: '2026-01-01', fim: null }]),
    ).toThrow(ErroMotor)
    expect(() =>
      ratearPorSocio(
        [],
        [{ socio: 'x', percentual: d('0.1'), inicio: '2026-02-01', fim: '2026-01-01' }],
      ),
    ).toThrow(ErroMotor)
    expect(() =>
      ratearPorSocio(
        [{ data: '2026-03-01', valor: d(1) }],
        [
          { socio: 'a', percentual: d('0.7'), inicio: '2026-01-01', fim: null },
          { socio: 'b', percentual: d('0.7'), inicio: '2026-01-01', fim: null },
        ],
      ),
    ).toThrow(ErroMotor)
  })
})
