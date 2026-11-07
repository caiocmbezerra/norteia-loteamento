import { describe, expect, it } from 'vitest'
import {
  CASO_REFERENCIA,
  Decimal,
  ErroMotor,
  type FluxoMensal,
  type Lancamento,
  TMA_REFERENCIA,
  agregarPorMes,
  aplicarChoques,
  anualParaMensal,
  centavos,
  estressar,
  exposicaoMaxima,
  matrizSensibilidade,
  mensalParaAnual,
  necessidadeDeAporte,
  paybackDescontado,
  paybackSimples,
  projetarViabilidade,
  resumirViabilidade,
  tabelaAmortizacao,
  tir,
  totalPorCategoria,
  trocasDeSinal,
  vpl,
  xirr,
} from './index'

const d = (v: string | number) => new Decimal(String(v))
const fluxo = (...v: number[]): FluxoMensal => ({ base: 'real', valores: v.map(d) })

describe('taxas (RN-F05)', () => {
  it('converte mensal ↔ anual', () => {
    expect(mensalParaAnual(d('0.01')).toFixed(6)).toBe('0.126825')
    expect(anualParaMensal(d('0.126825030131969720661201')).toFixed(10)).toBe('0.0100000000')
  })
})

describe('amortização', () => {
  it('Price sem arredondamento: prestação constante e saldo final zero', () => {
    const t = tabelaAmortizacao('price', d(8_100_000), d('0.005'), 120)
    expect(t).toHaveLength(120)
    expect(t[0]!.prestacao.toFixed(2)).toBe('89926.61')
    expect(t[119]!.prestacao.toFixed(2)).toBe('89926.61')
    expect(t[119]!.saldoDevedor.abs().lt('1e-20')).toBe(true)
  })

  it('Price com arredondamento: soma das amortizações fecha com o principal (RN-K02)', () => {
    const t = tabelaAmortizacao('price', d(1_000_000), d('0.0137'), 7, { arredondarCentavos: true })
    const amortizado = t.reduce((s, p) => s.plus(p.amortizacao), d(0))
    expect(amortizado.toString()).toBe('1000000')
    expect(t.slice(0, 6).every((p) => p.prestacao.isInteger())).toBe(true)
    expect(t[6]!.saldoDevedor.isZero()).toBe(true)
  })

  it('SAC: amortização constante e prestação decrescente', () => {
    const t = tabelaAmortizacao('sac', d(1200), d('0.01'), 12)
    expect(t[0]!.amortizacao.toString()).toBe('100')
    expect(t[0]!.prestacao.toString()).toBe('112')
    expect(t[11]!.prestacao.toString()).toBe('101')
  })

  it('taxa zero divide o principal igualmente', () => {
    const t = tabelaAmortizacao('price', d(1000), d(0), 4)
    expect(t.map((p) => p.prestacao.toString())).toEqual(['250', '250', '250', '250'])
  })

  it('recusa parâmetros inválidos', () => {
    expect(() => tabelaAmortizacao('price', d(100), d('0.01'), 0)).toThrow(ErroMotor)
    expect(() => tabelaAmortizacao('price', d(100), d('0.01'), 1.5)).toThrow(ErroMotor)
    expect(() => tabelaAmortizacao('price', d(-1), d('0.01'), 2)).toThrow(ErroMotor)
    expect(() => tabelaAmortizacao('sac', d(100), d('-0.01'), 2)).toThrow(ErroMotor)
  })
})

describe('fluxo', () => {
  const l = (mes: number, valor: number, categoria: Lancamento['categoria']): Lancamento => ({
    mes,
    valor: d(valor),
    categoria,
    natureza: 'projetado',
    centroCusto: 'x',
  })

  it('agrega por mês ignorando movimentos com sócios', () => {
    const f = agregarPorMes(
      [l(2, 10, 'receita_imobiliaria'), l(0, -5, 'custo'), l(1, 99, 'aporte'), l(2, -1, 'tributo')],
      'real',
    )
    expect(f.valores.map(String)).toEqual(['-5', '0', '9'])
  })

  it('recusa mês inválido', () => {
    expect(() => agregarPorMes([l(-1, 1, 'custo')], 'real')).toThrow(ErroMotor)
    expect(() => agregarPorMes([l(1.5, 1, 'custo')], 'real')).toThrow(ErroMotor)
  })

  it('totaliza por categoria', () => {
    const t = totalPorCategoria([l(0, 3, 'aporte'), l(1, 2, 'aporte'), l(1, -1, 'custo')])
    expect(t.aporte.toString()).toBe('5')
    expect(t.custo.toString()).toBe('-1')
    expect(t.distribuicao.toString()).toBe('0')
  })
})

describe('indicadores', () => {
  it('VPL não desconta o mês 0 e exige a mesma base (RN-F04, RN-F11)', () => {
    expect(
      vpl(fluxo(-100, 110), { base: 'real', mensal: d('0.1') })
        .abs()
        .lt('1e-20'),
    ).toBe(true)
    expect(() => vpl(fluxo(-100, 110), { base: 'nominal', mensal: d('0.1') })).toThrow(/mesma base/)
    expect(() => paybackDescontado(fluxo(-1, 2), { base: 'nominal', mensal: d(0) })).toThrow(
      ErroMotor,
    )
  })

  it('TIR de fluxo simples', () => {
    const r = tir(fluxo(-1000, 0, 1210))
    expect(r.mensal!.toFixed(10)).toBe('0.1000000000')
    expect(r.trocasDeSinal).toBe(1)
  })

  it('TIR exata no ponto médio da bisseção', () => {
    expect(tir(fluxo(-1, 0.555)).mensal!.toString()).toBe('-0.445')
  })

  it('sem troca de sinal não há TIR', () => {
    expect(tir(fluxo(-1, -2))).toMatchObject({ mensal: null, anual: null, trocasDeSinal: 0 })
  })

  it('TIR fora do intervalo pesquisado é nula', () => {
    expect(tir(fluxo(-1, 2000)).mensal).toBeNull()
  })

  it('avisa possível TIR múltipla (RN-F06)', () => {
    const r = tir(fluxo(-100, 230, -132))
    expect(r.possivelTirMultipla).toBe(true)
    expect(r.trocasDeSinal).toBe(2)
  })

  it('conta trocas de sinal ignorando zeros', () => {
    expect(trocasDeSinal([d(-1), d(0), d(-2), d(0), d(3)])).toBe(1)
  })

  it('payback (RN-F08)', () => {
    expect(paybackSimples(fluxo(-10, 5, 5, 1))).toBe(2)
    expect(paybackSimples(fluxo(5, 1))).toBe(0)
    expect(paybackSimples(fluxo(-10, 5))).toBeNull()
    expect(paybackDescontado(fluxo(-10, 5, 5, 5), { base: 'real', mensal: d('0.1') })).toBe(3)
  })

  it('exposição máxima (RN-F09)', () => {
    expect(exposicaoMaxima(fluxo(-5, -3, 10, -20))).toEqual({ valor: d(18), mes: 3 })
    expect(exposicaoMaxima(fluxo(1, 2)).valor.toString()).toBe('0')
  })

  it('necessidade de aporte com caixa mínimo', () => {
    expect(necessidadeDeAporte(fluxo(-5, -3, 10, -20), d(2)).map(String)).toEqual([
      '7',
      '3',
      '0',
      '10',
    ])
  })

  it('XIRR com datas reais', () => {
    const r = xirr([
      { data: '2026-01-01', valor: d(-1000) },
      { data: '2027-01-01', valor: d(1100) },
    ])
    expect(r!.toFixed(6)).toBe('0.100000')
  })

  it('XIRR sem dados, sem troca de sinal ou com data inválida', () => {
    expect(xirr([])).toBeNull()
    expect(xirr([{ data: '2026-01-01', valor: d(1) }])).toBeNull()
    expect(() => xirr([{ data: '01/01/2026', valor: d(1) }])).toThrow(ErroMotor)
  })
})

describe('viabilidade', () => {
  it('inadimplência na entrada reduz o recebido', () => {
    const base = resumirViabilidade(projetarViabilidade(CASO_REFERENCIA), TMA_REFERENCIA)
    const comEntrada = resumirViabilidade(
      projetarViabilidade({ ...CASO_REFERENCIA, inadimplenciaNaEntrada: true }),
      TMA_REFERENCIA,
    )
    expect(comEntrada.recebido.lt(base.recebido)).toBe(true)
  })

  it('sem lotes à venda: VGV zero e margem zero', () => {
    const r = resumirViabilidade(
      projetarViabilidade({ ...CASO_REFERENCIA, lotesVendaveis: 0 }),
      TMA_REFERENCIA,
    )
    expect(r.vgvVendido.isZero()).toBe(true)
    expect(r.margemSobreVgv.isZero()).toBe(true)
    expect(r.tir.mensal).toBeNull()
  })

  it.each([
    { lotesVendaveis: -1 },
    { lotesVendaveis: 1.5 },
    { vendas: { mesInicio: 0, lotesPorMes: 0 } },
    { comissao: d('1.1') },
    { inadimplencia: d('-0.1') },
    { custos: [{ ...CASO_REFERENCIA.custos[0]!, mesInicio: 5, mesFim: 4 }] },
    { custos: [{ ...CASO_REFERENCIA.custos[0]!, mesInicio: -1 }] },
    { custos: [{ ...CASO_REFERENCIA.custos[0]!, mesFim: 2.5 }] },
  ])('recusa premissa inválida %o', (alteracao) => {
    expect(() => projetarViabilidade({ ...CASO_REFERENCIA, ...alteracao })).toThrow(ErroMotor)
  })
})

describe('estresse e sensibilidade', () => {
  it('não altera as premissas originais', () => {
    const p = aplicarChoques(CASO_REFERENCIA, [{ tipo: 'preco', fator: d('0.5') }])
    expect(p.precoLoteCentavos).toBe(4_500_000)
    expect(CASO_REFERENCIA.precoLoteCentavos).toBe(centavos(9_000_000))
  })

  it('atraso nas vendas reduz a TIR', () => {
    const base = estressar(CASO_REFERENCIA, [], TMA_REFERENCIA)
    const atrasado = estressar(
      CASO_REFERENCIA,
      [{ tipo: 'atraso_vendas', meses: 6 }],
      TMA_REFERENCIA,
    )
    expect(atrasado.tir.anual!.lt(base.tir.anual!)).toBe(true)
  })

  it('choque em centro de custo inexistente é recusado', () => {
    expect(() =>
      aplicarChoques(CASO_REFERENCIA, [{ tipo: 'custo', centroCusto: 'nada', fator: d(2) }]),
    ).toThrow(ErroMotor)
  })

  it('choque de custo só altera o centro informado', () => {
    const p = aplicarChoques(CASO_REFERENCIA, [
      { tipo: 'custo', centroCusto: 'terreno', fator: d(2) },
    ])
    expect(p.custos.find((c) => c.centroCusto === 'terreno')!.valorCentavos).toBe(80_000_000)
    expect(p.custos.find((c) => c.centroCusto === 'aprovacao')!.valorCentavos).toBe(35_000_000)
  })

  it('matriz de sensibilidade preço × velocidade', () => {
    const m = matrizSensibilidade(
      CASO_REFERENCIA,
      [
        { tipo: 'preco', fator: d('0.9') },
        { tipo: 'preco', fator: d(1) },
      ],
      [
        { tipo: 'velocidade_vendas', lotesPorMes: 2 },
        { tipo: 'velocidade_vendas', lotesPorMes: 4 },
      ],
      TMA_REFERENCIA,
    )
    expect(m).toHaveLength(2)
    expect(m[1]![1]!.times(100).toFixed(1)).toBe('19.3')
    expect(m[0]![0]!.lt(m[1]![1]!)).toBe(true)
  })
})
