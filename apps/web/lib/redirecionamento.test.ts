import { describe, expect, it } from 'vitest'
import { destinoSeguro } from './redirecionamento'

describe('destinoSeguro', () => {
  it('aceita caminhos internos', () => {
    expect(destinoSeguro('/empreendimentos/1?aba=lotes')).toBe('/empreendimentos/1?aba=lotes')
  })
  it.each([undefined, null, '', 'https://golpe.com', '//golpe.com', '/\\golpe.com', 'painel'])(
    'recusa %s',
    (v) => {
      expect(destinoSeguro(v)).toBe('/painel')
    },
  )
})
