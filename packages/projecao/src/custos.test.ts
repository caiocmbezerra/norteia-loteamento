import {
  CASO_REFERENCIA,
  TMA_REFERENCIA,
  agregarPorMes,
  projetarViabilidade,
  resumirViabilidade,
} from '@norteia/motor-financeiro'
import { describe, expect, it } from 'vitest'
import {
  type ContaCusto,
  type ContratoCusto,
  type EntradaCustos,
  centroDeOrcamento,
  mesDoFluxo,
  orcamentoDoPlano,
  projetarAtual,
  projetarCustos,
} from './index'

const base: EntradaCustos = {
  dataBase: '2026-01-01',
  hoje: '2026-04-15',
  orcamento: [
    { centro: 'infraestrutura', tipo: 'total', valorCentavos: 1_000_000, mesInicio: 2, mesFim: 9 },
  ],
  contratos: [],
  contas: [],
  pagamentos: [],
}

const contrato = (o: Partial<ContratoCusto> = {}): ContratoCusto => ({
  id: 'k1',
  centro: 'infraestrutura.drenagem',
  valorCentavos: 600_000,
  dataInicio: '2026-03-01',
  dataFimPrevista: '2026-08-31',
  situacao: 'vigente',
  ...o,
})

const conta = (o: Partial<ContaCusto> = {}): ContaCusto => ({
  id: 'c1',
  centro: 'infraestrutura.drenagem',
  contratoId: 'k1',
  valorCentavos: 200_000,
  vencimento: '2026-04-10',
  cancelada: false,
  ...o,
})

const total = (r: ReturnType<typeof projetarCustos>, natureza?: string) =>
  r.lancamentos
    .filter((l) => !natureza || l.natureza === natureza)
    .reduce((s, l) => s - l.valor.toNumber(), 0)

describe('mesDoFluxo', () => {
  it('conta meses a partir da data-base e nunca fica negativo', () => {
    expect(mesDoFluxo('2026-01-01', '2026-01-31')).toBe(0)
    expect(mesDoFluxo('2026-01-01', '2027-03-05')).toBe(14)
    expect(mesDoFluxo('2026-01-01', '2025-12-31')).toBe(0)
    expect(() => mesDoFluxo('2026-01-01', '01/02/2026')).toThrow('Data inválida')
  })
})

describe('centroDeOrcamento', () => {
  it('sobe na hierarquia até achar um centro orçado', () => {
    const orcados = new Set(['infraestrutura', 'terreno'])
    expect(centroDeOrcamento('infraestrutura.drenagem', orcados)).toBe('infraestrutura')
    expect(centroDeOrcamento('terreno', orcados)).toBe('terreno')
    expect(centroDeOrcamento('comercial.marketing', orcados)).toBe('comercial.marketing')
  })
})

describe('projetarCustos (RN-F03: sem dupla contagem)', () => {
  it('sem fatos: todo o orçamento é projetado nos meses restantes', () => {
    const r = projetarCustos(base)
    expect(r.mesAtual).toBe(3)
    expect(r.total.projetado.toNumber()).toBe(1_000_000)
    expect(r.lancamentos.map((l) => l.mes)).toEqual([3, 4, 5, 6, 7, 8, 9])
    expect(total(r)).toBeCloseTo(1_000_000, 6)
  })

  it('orçado = realizado + comprometido + projetado, com contrato em subcentro', () => {
    const r = projetarCustos({
      ...base,
      contratos: [contrato()],
      contas: [conta()],
      pagamentos: [{ contaId: 'c1', data: '2026-04-10', valorCentavos: 150_000, estornado: false }],
    })
    const c = r.porCentro[0]!
    expect(c.centro).toBe('infraestrutura')
    expect(c.realizado.toNumber()).toBe(150_000)
    // 50.000 em aberto na conta + 400.000 do contrato ainda não faturado
    expect(c.comprometido.toNumber()).toBe(450_000)
    expect(c.projetado.toNumber()).toBe(400_000)
    expect(c.orcado.toNumber()).toBe(c.realizado.plus(c.comprometido).plus(c.projetado).toNumber())
    expect(c.estouro.isZero()).toBe(true)
    expect(total(r)).toBeCloseTo(1_000_000, 6)
    expect(total(r, 'realizado')).toBe(150_000)
  })

  it('pagamento estornado, conta cancelada e contrato encerrado não contam', () => {
    const r = projetarCustos({
      ...base,
      contratos: [
        contrato({ situacao: 'encerrado' }),
        contrato({ id: 'k2', situacao: 'cancelado' }),
      ],
      contas: [conta(), conta({ id: 'c2', cancelada: true })],
      pagamentos: [
        { contaId: 'c1', data: '2026-04-10', valorCentavos: 200_000, estornado: true },
        { contaId: 'x', data: '2026-04-10', valorCentavos: 1, estornado: false },
      ],
    })
    expect(r.total.realizado.isZero()).toBe(true)
    expect(r.total.comprometido.toNumber()).toBe(200_000)
    expect(r.total.projetado.toNumber()).toBe(800_000)
  })

  it('conta vencida em aberto vai para o mês atual; contrato antigo distribui a partir de agora', () => {
    const r = projetarCustos({
      ...base,
      hoje: '2026-06-01',
      contratos: [contrato({ dataInicio: '2026-01-01', dataFimPrevista: '2026-02-28' })],
      contas: [conta({ vencimento: '2026-02-10', contratoId: null })],
    })
    const comprometidos = r.lancamentos.filter((l) => l.natureza === 'comprometido')
    expect(comprometidos.every((l) => l.mes === 5)).toBe(true)
    expect(total(r, 'comprometido')).toBe(800_000)
  })

  it('estouro: gasto acima do orçado não gera projetado negativo', () => {
    const r = projetarCustos({ ...base, contratos: [contrato({ valorCentavos: 1_300_000 })] })
    const c = r.porCentro[0]!
    expect(c.projetado.isZero()).toBe(true)
    expect(c.estouro.toNumber()).toBe(300_000)
    expect(c.custoFinal.toNumber()).toBe(1_300_000)
    expect(r.total.estouro.toNumber()).toBe(300_000)
  })

  it('contrato totalmente faturado (ou além) não gera saldo a comprometer; valor zero não vira lançamento', () => {
    const r = projetarCustos({
      ...base,
      contratos: [
        contrato({ valorCentavos: 200_000 }),
        contrato({ id: 'k2', valorCentavos: 100_000 }),
      ],
      contas: [conta(), conta({ id: 'c2', contratoId: 'k2', valorCentavos: 150_000 })],
      pagamentos: [{ contaId: 'c1', data: '2026-04-10', valorCentavos: 0, estornado: false }],
    })
    expect(r.total.comprometido.toNumber()).toBe(350_000)
    expect(r.lancamentos.some((l) => l.valor.isZero())).toBe(false)
  })

  it('gasto sem orçamento aparece no próprio centro como estouro', () => {
    const r = projetarCustos({
      ...base,
      orcamento: [],
      contas: [conta({ centro: 'outros', contratoId: null })],
    })
    expect(r.porCentro).toHaveLength(1)
    expect(r.porCentro[0]).toMatchObject({ centro: 'outros' })
    expect(r.porCentro[0]!.estouro.toNumber()).toBe(200_000)
  })

  it('orçamento mensal e período já passado', () => {
    const r = projetarCustos({
      ...base,
      hoje: '2026-12-01',
      orcamento: [
        { centro: 'administracao', tipo: 'mensal', valorCentavos: 8_000, mesInicio: 1, mesFim: 4 },
        { centro: 'terreno', tipo: 'total', valorCentavos: 50_000, mesInicio: 0, mesFim: 0 },
      ],
    })
    expect(r.porCentro.map((c) => c.centro)).toEqual(['administracao', 'terreno'])
    expect(r.porCentro[0]!.orcado.toNumber()).toBe(32_000)
    // Período do orçamento já passou: o que falta fica no mês atual
    expect(r.lancamentos.every((l) => l.mes === 11)).toBe(true)
  })
})

describe('fluxo atual', () => {
  it('sem fatos e com o orçamento do plano, reproduz o plano (mesmo TIR e VPL)', () => {
    const custos = projetarCustos({
      dataBase: '2026-01-01',
      hoje: '2026-01-01',
      orcamento: orcamentoDoPlano(CASO_REFERENCIA),
      contratos: [],
      contas: [],
      pagamentos: [],
    })
    const plano = resumirViabilidade(projetarViabilidade(CASO_REFERENCIA), TMA_REFERENCIA)
    const atual = resumirViabilidade(projetarAtual(CASO_REFERENCIA, custos), TMA_REFERENCIA)
    expect(atual.custos.toFixed(2)).toBe(plano.custos.toFixed(2))
    expect(atual.tir.mensal!.minus(plano.tir.mensal!).abs().lt('1e-12')).toBe(true)
    expect(atual.vpl.minus(plano.vpl).abs().lt('1e-6')).toBe(true)
  })

  it('custos do estudo nunca se somam aos da projeção', () => {
    const custos = projetarCustos({ ...base, orcamento: [] })
    const atual = projetarAtual(CASO_REFERENCIA, custos)
    const fluxo = agregarPorMes(atual.lancamentos, 'real', ['custo'])
    expect(fluxo.valores.every((v) => v.isZero())).toBe(true)
  })
})
