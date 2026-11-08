import {
  CASO_REFERENCIA,
  TMA_REFERENCIA,
  projetarViabilidade,
  resumirViabilidade,
  totalPorCategoria,
} from '@norteia/motor-financeiro'
import { describe, expect, it } from 'vitest'
import {
  type VendaReal,
  orcamentoDoPlano,
  projetarAtual,
  projetarCustos,
  projetarReceitas,
} from './index'

// Venda com as mesmas condições do plano do caso de referência (mês 0 = jan/2026).
const venda = (o: Partial<VendaReal> = {}): VendaReal => ({
  dataVenda: '2027-02-10', // mês 13
  precoCentavos: 9_000_000,
  entradaCentavos: 900_000,
  parcelas: 120,
  jurosMensal: '0.005',
  sistema: 'price',
  primeiraParcelaEm: '2027-03-10', // mês 14
  comissaoPercentual: '0.05',
  comissaoModo: 'ato',
  ...o,
})

const base = { dataBase: '2026-01-01', hoje: '2026-01-01', premissas: CASO_REFERENCIA }
const totais = (vendas: VendaReal[], hoje = '2026-01-01') =>
  totalPorCategoria(projetarReceitas({ ...base, hoje, vendas }).lancamentos)

describe('projetarReceitas', () => {
  it('sem vendas e no mês 0, é igual às receitas do plano', () => {
    const r = projetarReceitas({ ...base, vendas: [] })
    const plano = projetarViabilidade({ ...CASO_REFERENCIA, custos: [] })
    expect(r.vgvVendido.eq(plano.vgvVendido)).toBe(true)
    const a = totalPorCategoria(r.lancamentos)
    const b = totalPorCategoria(plano.lancamentos)
    for (const c of ['receita_imobiliaria', 'receita_juros', 'comissao', 'tributo'] as const) {
      expect(a[c].minus(b[c]).abs().lt('1e-12')).toBe(true)
    }
  })

  it('venda real nas condições do plano mantém totais de recebido, comissão e tributos', () => {
    const plano = totais([])
    const comVenda = totais([venda()])
    for (const c of ['receita_imobiliaria', 'receita_juros', 'comissao', 'tributo'] as const) {
      expect(comVenda[c].minus(plano[c]).abs().lt('1e-6')).toBe(true)
    }
  })

  it('soma o VGV real ao estoque restante e conta as vendas do mês', () => {
    const r = projetarReceitas({
      ...base,
      vendas: [venda({ precoCentavos: 10_000_000, entradaCentavos: 1_000_000 })],
    })
    expect(r.vgvVendido.toNumber()).toBe(10_000_000 + 101 * 9_000_000)
    expect(r.vendasPorMes[13]).toBe(5)
  })

  it('comissão sobre o recebido acompanha entrada e amortização recebidas (RN-C06)', () => {
    const t = totais([venda({ comissaoModo: 'recebido' })])
    const ato = totais([venda()])
    // Diferença = 5% da parte do financiamento que não será recebida (7% de inadimplência)
    const diferenca = t.comissao.minus(ato.comissao).toNumber()
    expect(diferenca).toBeCloseTo(0.05 * 8_100_000 * 0.07, 4)
  })

  it('venda à vista gera só a entrada; vendas acima do plano zeram o estoque projetado', () => {
    const vendas = Array.from({ length: 103 }, () =>
      venda({ entradaCentavos: 9_000_000, parcelas: 0, primeiraParcelaEm: null }),
    )
    const r = projetarReceitas({ ...base, vendas })
    const t = totalPorCategoria(r.lancamentos)
    expect(t.receita_juros.isZero()).toBe(true)
    expect(t.receita_imobiliaria.toNumber()).toBe(103 * 9_000_000)
    expect(r.vgvVendido.toNumber()).toBe(103 * 9_000_000)
  })

  it('inadimplência na entrada, quando prevista, reduz a entrada recebida', () => {
    const r = projetarReceitas({
      ...base,
      premissas: { ...CASO_REFERENCIA, inadimplenciaNaEntrada: true, lotesVendaveis: 1 },
      vendas: [venda({ entradaCentavos: 9_000_000, parcelas: 0, primeiraParcelaEm: null })],
    })
    expect(totalPorCategoria(r.lancamentos).receita_imobiliaria.toNumber()).toBe(9_000_000 * 0.93)
  })

  it('estoque restante nunca é projetado antes do mês atual', () => {
    const r = projetarReceitas({ ...base, hoje: '2027-07-15', vendas: [] }) // mês 18
    expect(r.vendasPorMes.slice(0, 18).every((q) => !q)).toBe(true)
    expect(r.vendasPorMes[18]).toBe(4)
  })
})

describe('fluxo atual com vendas reais', () => {
  it('vendas antecipadas nas condições do plano mantêm o lucro e elevam a TIR', () => {
    const custos = projetarCustos({
      dataBase: '2026-01-01',
      hoje: '2026-01-01',
      orcamento: orcamentoDoPlano(CASO_REFERENCIA),
      contratos: [],
      contas: [],
      pagamentos: [],
    })
    const plano = resumirViabilidade(projetarViabilidade(CASO_REFERENCIA), TMA_REFERENCIA)
    const atual = resumirViabilidade(
      projetarAtual(CASO_REFERENCIA, custos, {
        dataBase: '2026-01-01',
        hoje: '2026-01-01',
        vendas: Array.from({ length: 4 }, () => venda()),
      }),
      TMA_REFERENCIA,
    )
    expect(atual.lucroNominal.minus(plano.lucroNominal).abs().lt('1e-4')).toBe(true)
    expect(atual.tir.anual!.gt(plano.tir.anual!)).toBe(true)
  })
})
