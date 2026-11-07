import { centavos } from '@norteia/motor-financeiro'
import { describe, expect, it } from 'vitest'
import {
  ErroGrade,
  codigoQuadra,
  errosPorCampo,
  esquemaCadastroInicial,
  esquemaNovoEmpreendimento,
  gerarGrade,
} from './index'

describe('codigoQuadra', () => {
  it.each([
    [0, 'A'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
    [701, 'ZZ'],
    [702, 'AAA'],
  ])('%i → %s', (i, esperado) => {
    expect(codigoQuadra(i)).toBe(esperado)
  })

  it('aceita numeração', () => {
    expect(codigoQuadra(0, 'numero')).toBe('1')
    expect(codigoQuadra(9, 'numero')).toBe('10')
  })

  it('recusa índice inválido', () => {
    expect(() => codigoQuadra(-1)).toThrow(ErroGrade)
    expect(() => codigoQuadra(1.5)).toThrow(ErroGrade)
  })
})

describe('gerarGrade', () => {
  it('gera quadras × lotes com os valores padrão', () => {
    const lotes = gerarGrade({
      quadras: 3,
      lotesPorQuadra: 40,
      areaM2: '300.00',
      precoBaseCentavos: centavos(9_000_000),
    })
    expect(lotes).toHaveLength(120)
    expect(lotes[0]).toEqual({
      quadra: 'A',
      numero: '1',
      areaM2: '300.00',
      precoBaseCentavos: 9_000_000,
    })
    expect(lotes.at(-1)).toMatchObject({ quadra: 'C', numero: '40' })
    expect(new Set(lotes.map((l) => `${l.quadra}-${l.numero}`)).size).toBe(120)
  })

  it('aceita preço vazio e quadras numeradas', () => {
    const lotes = gerarGrade({
      quadras: 2,
      lotesPorQuadra: 1,
      areaM2: '250',
      precoBaseCentavos: null,
      estiloQuadra: 'numero',
    })
    expect(lotes.map((l) => l.quadra)).toEqual(['1', '2'])
    expect(lotes[0]?.precoBaseCentavos).toBeNull()
  })

  it.each([
    [{ quadras: 0, lotesPorQuadra: 10 }, 'quadras'],
    [{ quadras: 201, lotesPorQuadra: 10 }, 'quadras'],
    [{ quadras: 2.5, lotesPorQuadra: 10 }, 'quadras'],
    [{ quadras: 1, lotesPorQuadra: 0 }, 'lotes por quadra'],
    [{ quadras: 1, lotesPorQuadra: 501 }, 'lotes por quadra'],
    [{ quadras: 20, lotesPorQuadra: 300 }, 'no máximo'],
  ])('recusa %o', (dims, trecho) => {
    expect(() => gerarGrade({ ...dims, areaM2: '300', precoBaseCentavos: null })).toThrow(trecho)
  })

  it('recusa área inválida', () => {
    for (const areaM2 of ['0', '-1', 'abc', '300,00', '1.234']) {
      expect(() =>
        gerarGrade({ quadras: 1, lotesPorQuadra: 1, areaM2, precoBaseCentavos: null }),
      ).toThrow(ErroGrade)
    }
  })
})

describe('esquemas de cadastro', () => {
  const valido = {
    nomeLoteadora: 'Loteadora Horizonte',
    nomeEmpreendimento: 'Residencial Bela Vista',
    municipio: 'Uberlândia',
    uf: 'MG',
    mesBase: '2026-11',
    quadras: '3',
    lotesPorQuadra: '40',
    areaPadrao: '312,50',
    precoPadrao: 'R$ 90.000,00',
  }

  it('converte os valores digitados', () => {
    const r = esquemaCadastroInicial.parse(valido)
    expect(r).toMatchObject({
      quadras: 3,
      lotesPorQuadra: 40,
      areaPadrao: '312.50',
      precoPadrao: 9_000_000,
      mesBase: '2026-11-01',
    })
  })

  it('preço vazio vira nulo', () => {
    expect(esquemaNovoEmpreendimento.parse({ ...valido, precoPadrao: '' }).precoPadrao).toBeNull()
  })

  it('aponta o erro de cada campo em português', () => {
    const r = esquemaCadastroInicial.safeParse({
      ...valido,
      nomeLoteadora: 'X',
      uf: 'XX',
      mesBase: '2026-13',
      quadras: 'abc',
      areaPadrao: '0',
      precoPadrao: '9,0,0',
    })
    expect(r.success).toBe(false)
    const erros = errosPorCampo(r.error!)
    expect(erros).toMatchObject({
      nomeLoteadora: expect.stringContaining('ao menos 2'),
      uf: 'UF: escolha um estado.',
      mesBase: expect.stringContaining('AAAA-MM'),
      quadras: expect.stringContaining('número'),
      areaPadrao: expect.stringContaining('maior que zero'),
      precoPadrao: expect.stringContaining('90.000,00'),
    })
  })

  it('limita o total de lotes da grade', () => {
    const r = esquemaNovoEmpreendimento.safeParse({
      ...valido,
      quadras: '20',
      lotesPorQuadra: '300',
    })
    expect(r.success).toBe(false)
    expect(errosPorCampo(r.error!).lotesPorQuadra).toContain('no máximo')
  })
})
