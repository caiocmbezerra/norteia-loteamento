import { describe, expect, it } from 'vitest'
import { ROTULO_SITUACAO_MAPA, SITUACOES_MAPA, situacaoNoMapa } from './cadastro'

describe('situação no mapa', () => {
  it('lote vendido com contrato quitado aparece como quitado', () => {
    expect(situacaoNoMapa('vendido', true)).toBe('quitado')
    expect(situacaoNoMapa('vendido', false)).toBe('vendido')
    expect(situacaoNoMapa('disponivel', true)).toBe('disponivel')
    expect(ROTULO_SITUACAO_MAPA.quitado).toBe('Quitado')
    expect(SITUACOES_MAPA).toContain('quitado')
  })
})
