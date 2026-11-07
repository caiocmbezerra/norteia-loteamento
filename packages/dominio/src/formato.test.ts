import { centavos } from '@norteia/motor-financeiro'
import { describe, expect, it } from 'vitest'
import {
  ErroFormato,
  formatarData,
  formatarMoeda,
  formatarPercentual,
  lerData,
  lerMoeda,
} from './index'

const nbsp = '\u00a0'

describe('formatarMoeda', () => {
  it('usa o padrão brasileiro', () => {
    expect(formatarMoeda(centavos(123_456))).toBe(`R$${nbsp}1.234,56`)
    expect(formatarMoeda(centavos(918_000_000))).toBe(`R$${nbsp}9.180.000,00`)
    expect(formatarMoeda(centavos(5))).toBe(`R$${nbsp}0,05`)
    expect(formatarMoeda(centavos(-344_795_142))).toBe(`-R$${nbsp}3.447.951,42`)
  })
})

describe('lerMoeda', () => {
  it.each([
    ['R$ 1.234,56', 123_456],
    [`R$${nbsp}1.234,56`, 123_456],
    ['1234,56', 123_456],
    ['1.234', 123_400],
    ['90.000', 9_000_000],
    ['-10,5', -1_050],
    ['0,01', 1],
    ['3.000.000,00', 300_000_000],
  ])('lê "%s"', (texto, esperado) => {
    expect(lerMoeda(texto)).toBe(esperado)
  })

  it.each(['', 'abc', '1,2,3', '1.23,00', '12,345', '1.2345'])('recusa "%s"', (texto) => {
    expect(() => lerMoeda(texto)).toThrow(ErroFormato)
  })
})

describe('datas', () => {
  it('formata data de negócio sem deslocamento de fuso', () => {
    expect(formatarData('2026-01-01')).toBe('01/01/2026')
    expect(formatarData('2026-12-31')).toBe('31/12/2026')
  })

  it('lê datas brasileiras', () => {
    expect(lerData('07/11/2026')).toBe('2026-11-07')
    expect(lerData(' 29/02/2028 ')).toBe('2028-02-29')
  })

  it('recusa datas inválidas ou inexistentes', () => {
    expect(() => formatarData('07/11/2026')).toThrow(ErroFormato)
    expect(() => lerData('2026-11-07')).toThrow(ErroFormato)
    expect(() => lerData('29/02/2027')).toThrow(ErroFormato)
    expect(() => lerData('31/04/2026')).toThrow(ErroFormato)
    expect(() => lerData('01/13/2026')).toThrow(ErroFormato)
    expect(() => lerData('00/01/2026')).toThrow(ErroFormato)
  })
})

describe('formatarPercentual', () => {
  it('formata frações como percentual brasileiro', () => {
    expect(formatarPercentual('0.014814')).toBe('1,48%')
    expect(formatarPercentual('0.193', 1)).toBe('19,3%')
    expect(formatarPercentual('0.0593')).toBe('5,93%')
    expect(formatarPercentual('-0.05', 0)).toBe('-5%')
    expect(formatarPercentual('12.5')).toBe('1.250,00%')
  })
})
