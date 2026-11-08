import {
  CASO_REFERENCIA,
  Decimal,
  type Lancamento,
  TMA_REFERENCIA,
  projetarViabilidade,
  resumirViabilidade,
  totalPorCategoria,
} from '@norteia/motor-financeiro'
import { describe, expect, it } from 'vitest'
import {
  type ParcelaReal,
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

describe('projetarReceitas com contrato (Fase 5)', () => {
  // R$ 1.000,00: entrada 100,00 (paga) + 2 parcelas de 460,00 (450 amortização + 10 juros)
  const parcela = (o: Partial<ParcelaReal>): ParcelaReal => ({
    numero: 1,
    vencimento: '2026-03-10',
    valorCentavos: 46_000,
    amortizacaoCentavos: 45_000,
    jurosCentavos: 1_000,
    correcaoCentavos: 0,
    situacao: 'aberta',
    recebimentos: [],
    ...o,
  })
  const comContrato = (contrato: ParcelaReal[], o: Partial<VendaReal> = {}) =>
    venda({
      dataVenda: '2026-02-10',
      precoCentavos: 100_000,
      entradaCentavos: 10_000,
      parcelas: 2,
      contrato,
      ...o,
    })
  const premissas = { ...CASO_REFERENCIA, lotesVendaveis: 1 }
  const projetar = (v: VendaReal, hoje = '2026-05-15') =>
    projetarReceitas({ dataBase: '2026-01-01', hoje, premissas, vendas: [v] }).lancamentos
  const soma = (l: Lancamento[]) => l.reduce((s, x) => s.plus(x.valor), new Decimal(0)).toNumber()

  it('recebido é realizado no mês do pagamento, com encargos como juros', () => {
    const l = projetar(
      comContrato([
        parcela({
          numero: 0,
          vencimento: '2026-02-10',
          valorCentavos: 10_000,
          amortizacaoCentavos: 10_000,
          jurosCentavos: 0,
          situacao: 'paga',
          recebimentos: [{ data: '2026-02-10', principalCentavos: 10_000, encargosCentavos: 0 }],
        }),
        parcela({
          recebimentos: [{ data: '2026-04-02', principalCentavos: 23_000, encargosCentavos: 700 }],
        }),
        parcela({ numero: 2, vencimento: '2026-08-10' }),
        parcela({
          numero: 3,
          situacao: 'cancelada',
          recebimentos: [{ data: '2026-05-02', principalCentavos: 1_000, encargosCentavos: 0 }],
        }),
      ]),
    )
    const realizado = l.filter((x) => x.natureza === 'realizado')
    expect(soma(realizado.filter((x) => x.mes === 1))).toBe(10_000)
    expect(
      soma(realizado.filter((x) => x.mes === 3 && x.categoria === 'receita_imobiliaria')),
    ).toBe(22_500)
    expect(soma(realizado.filter((x) => x.mes === 3 && x.categoria === 'receita_juros'))).toBe(
      1_200,
    )
    // Parcela renegociada: o pago fica como realizado; o saldo não entra
    expect(soma(realizado.filter((x) => x.mes === 4))).toBeCloseTo(1_000, 6)
    // Saldo vencido da parcela 1 cai no mês atual (4); a parcela 2, no vencimento (7)
    const carteira = l.filter(
      (x) => x.natureza === 'carteira' && x.categoria !== 'comissao' && x.categoria !== 'tributo',
    )
    expect(soma(carteira.filter((x) => x.mes === 4))).toBeCloseTo(23_000 * 0.93, 6)
    expect(soma(carteira.filter((x) => x.mes === 7))).toBeCloseTo(46_000 * 0.93, 6)
    expect(carteira.some((x) => x.mes < 4)).toBe(false)
    // Tributos do recebido ficam comprometidos
    const tributoReal = l.filter((x) => x.categoria === 'tributo' && x.natureza === 'comprometido')
    expect(soma(tributoReal)).toBeCloseTo(-(10_000 + 23_700 + 1_000) * 0.0593, 6)
  })

  it('correção do reajuste entra como receita imobiliária', () => {
    const l = projetar(
      comContrato([
        parcela({ valorCentavos: 47_000, correcaoCentavos: 1_000, vencimento: '2026-08-10' }),
      ]),
    )
    const mes7 = l.filter((x) => x.mes === 7 && x.natureza === 'carteira')
    const soma7 = (c: string) => soma(mes7.filter((x) => x.categoria === c))
    expect(soma7('receita_imobiliaria')).toBeCloseTo(46_000 * 0.93, 6)
    expect(soma7('receita_juros')).toBeCloseTo(1_000 * 0.93, 6)
  })

  it('comissão sobre o recebido no contrato e entrada em aberto', () => {
    const l = projetar(
      comContrato(
        [
          parcela({
            numero: 0,
            vencimento: '2026-02-10',
            valorCentavos: 10_000,
            amortizacaoCentavos: 10_000,
            jurosCentavos: 0,
          }),
          parcela({
            recebimentos: [{ data: '2026-03-10', principalCentavos: 46_000, encargosCentavos: 0 }],
            situacao: 'paga',
          }),
        ],
        { comissaoModo: 'recebido' },
      ),
    )
    const comissao = l.filter((x) => x.categoria === 'comissao')
    expect(soma(comissao.filter((x) => x.natureza === 'comprometido'))).toBe(-45_000 * 0.05)
    // Entrada em aberto não sofre inadimplência no caso de referência
    expect(soma(comissao.filter((x) => x.natureza === 'carteira'))).toBe(-10_000 * 0.05)
  })
})

describe('projetarReceitas com distrato (Fase 6)', () => {
  it('distrato: sai do VGV, lote volta ao estoque, recebido fica e devolução é saída', () => {
    const premissas = { ...CASO_REFERENCIA, lotesVendaveis: 2 }
    const v = venda({
      dataVenda: '2026-02-10',
      precoCentavos: 100_000,
      entradaCentavos: 10_000,
      parcelas: 1,
      contrato: [
        {
          numero: 0,
          vencimento: '2026-02-10',
          valorCentavos: 10_000,
          amortizacaoCentavos: 10_000,
          jurosCentavos: 0,
          correcaoCentavos: 0,
          situacao: 'paga',
          recebimentos: [{ data: '2026-02-10', principalCentavos: 10_000, encargosCentavos: 0 }],
        },
        {
          numero: 1,
          vencimento: '2026-03-10',
          valorCentavos: 90_000,
          amortizacaoCentavos: 90_000,
          jurosCentavos: 0,
          correcaoCentavos: 0,
          situacao: 'cancelada',
          recebimentos: [],
        },
      ],
      distrato: {
        devolucoes: [
          { vencimento: '2026-04-10', valorCentavos: 1_000, pagoEm: '2026-04-12' },
          { vencimento: '2026-03-10', valorCentavos: 1_000, pagoEm: null },
        ],
      },
    })
    const r = projetarReceitas({
      dataBase: '2026-01-01',
      hoje: '2026-05-15',
      premissas,
      vendas: [v],
    })
    const t = totalPorCategoria(r.lancamentos)
    expect(r.vgvVendido.toNumber()).toBe(2 * 9_000_000)
    expect(r.vendasPorMes.reduce((a, b) => a + (b ?? 0), 0)).toBe(2)
    expect(t.devolucao_distrato.toNumber()).toBe(-2_000)
    const dev = r.lancamentos.filter((l) => l.categoria === 'devolucao_distrato')
    expect(dev.map((l) => `${l.mes}:${l.natureza}`).sort()).toEqual([
      '3:realizado',
      '4:comprometido',
    ])
    const recebido = r.lancamentos.filter(
      (l) => l.natureza === 'realizado' && l.categoria === 'receita_imobiliaria',
    )
    expect(recebido.reduce((s, l) => s + l.valor.toNumber(), 0)).toBe(10_000)
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
