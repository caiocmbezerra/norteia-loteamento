import { describe, expect, it } from 'vitest'
import { cnpjValido, cpfValido, soDigitos } from './documentos'

describe('CPF e CNPJ', () => {
  it('confere dígitos verificadores', () => {
    expect(cpfValido('529.982.247-25')).toBe(true)
    expect(cpfValido('52998224724')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('123')).toBe(false)
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11222333000182')).toBe(false)
    expect(cnpjValido('00000000000000')).toBe(false)
    expect(cnpjValido('1122233300018')).toBe(false)
  })
  it('limpa a máscara', () => {
    expect(soDigitos('11.222.333/0001-81')).toBe('11222333000181')
  })
})
