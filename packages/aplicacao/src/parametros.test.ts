import { describe, expect, it } from 'vitest'
import { ErroAplicacao } from './erros'
import { textoDoValor, valorDoTexto } from './parametros'

const pct = { tipo: 'decimal' as const, unidade: 'fração', valoresPermitidos: null }
const pctMes = { tipo: 'decimal' as const, unidade: 'fração ao mês', valoresPermitidos: null }

describe('parâmetros: texto ⇄ valor', () => {
  it('percentuais são digitados em % e guardados como fração', () => {
    expect(valorDoTexto(pct, '2')).toBe('0.02')
    expect(valorDoTexto(pctMes, '0,5')).toBe('0.005')
    expect(textoDoValor(pct, '0.02')).toBe('2%')
    expect(textoDoValor(pctMes, '"0.005"')).toBe('0,5% ao mês')
  })

  it('inteiros, reais, sim/não e opções', () => {
    expect(valorDoTexto({ tipo: 'inteiro', unidade: 'meses', valoresPermitidos: null }, '12')).toBe(
      12,
    )
    expect(textoDoValor({ tipo: 'inteiro', unidade: 'meses' }, '12')).toBe('12 meses')
    expect(
      valorDoTexto({ tipo: 'centavos', unidade: 'centavos', valoresPermitidos: null }, '50.000,00'),
    ).toBe(5_000_000)
    expect(textoDoValor({ tipo: 'centavos', unidade: 'centavos' }, '5000000')).toBe('R$ 50000,00')
    expect(valorDoTexto({ tipo: 'booleano', unidade: null, valoresPermitidos: null }, 'nao')).toBe(
      false,
    )
    expect(textoDoValor({ tipo: 'booleano', unidade: null }, 'true')).toBe('Sim')
    const opcoes = {
      tipo: 'texto' as const,
      unidade: null,
      valoresPermitidos: ['aplicar', 'ignorar'],
    }
    expect(valorDoTexto(opcoes, 'ignorar')).toBe('ignorar')
    expect(textoDoValor(opcoes, '"ignorar"')).toBe('ignorar')
  })

  it('recusa valores fora do formato', () => {
    expect(() => valorDoTexto(pct, 'dois')).toThrow(ErroAplicacao)
    expect(() =>
      valorDoTexto({ tipo: 'inteiro', unidade: null, valoresPermitidos: null }, '1,5'),
    ).toThrow(ErroAplicacao)
    expect(() =>
      valorDoTexto({ tipo: 'booleano', unidade: null, valoresPermitidos: null }, 'talvez'),
    ).toThrow(ErroAplicacao)
    expect(() =>
      valorDoTexto({ tipo: 'texto', unidade: null, valoresPermitidos: ['a'] }, 'b'),
    ).toThrow(ErroAplicacao)
  })
})
