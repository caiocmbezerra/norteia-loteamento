import { premissasParaJson } from '@norteia/dominio'
import { CASO_REFERENCIA } from '@norteia/motor-financeiro'
import { describe, expect, it } from 'vitest'
import { analisarViabilidade, estressesPadrao, premissasSugeridas } from './viabilidade'

describe('análise de viabilidade', () => {
  const a = analisarViabilidade(premissasParaJson(CASO_REFERENCIA), '0.012')

  it('base reproduz o caso de referência', () => {
    expect(a.base.tir.anual!.times(100).toFixed(1)).toBe('19.3')
  })

  it('roda os estresses padrão, todos com TIR menor que a base', () => {
    expect(a.estresses.map((e) => e.nome)).toEqual([
      'Vendas na metade da velocidade',
      'Preço 10% menor',
      'Infraestrutura 15% mais cara',
      'Inadimplência dobra',
      'Atraso de 6 meses nas vendas',
    ])
    for (const e of a.estresses) expect(e.resumo.tir.anual!.lt(a.base.tir.anual!)).toBe(true)
  })

  it('matriz de sensibilidade: preço 100% × velocidade original = base', () => {
    expect(a.sensibilidade.velocidades).toEqual([2, 4, 6])
    expect(a.sensibilidade.tirAnual[1]![1]!.eq(a.base.tir.anual!)).toBe(true)
  })

  it('sem centro de infraestrutura, não aplica o estresse de obra', () => {
    const p = {
      ...CASO_REFERENCIA,
      custos: CASO_REFERENCIA.custos.filter((c) => c.centroCusto !== 'infraestrutura'),
    }
    expect(estressesPadrao(p).some((e) => e.nome.includes('Infraestrutura'))).toBe(false)
  })
})

describe('premissas sugeridas', () => {
  it('usa os lotes vendáveis e o preço médio; tributos e custos para o usuário preencher', () => {
    const p = premissasSugeridas([
      { status: 'disponivel', preco_base_centavos: 9_000_000 },
      { status: 'bloqueado', preco_base_centavos: 10_000_000 },
      { status: 'permuta', preco_base_centavos: 9_000_000 },
      { status: 'disponivel', preco_base_centavos: null },
    ])
    expect(p.lotesVendaveis).toBe(3)
    expect(p.precoLoteCentavos).toBe(9_500_000)
    expect(p.aliquotaSobreRecebido).toBe('0')
    expect(p.custos.every((c) => c.valorCentavos === 0)).toBe(true)
  })

  it('sem preço cadastrado, começa em zero', () => {
    expect(
      premissasSugeridas([{ status: 'disponivel', preco_base_centavos: null }]).precoLoteCentavos,
    ).toBe(0)
  })
})
