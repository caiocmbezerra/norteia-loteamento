import { Decimal } from '@norteia/motor-financeiro'
import { describe, expect, it } from 'vitest'
import { type EntradaAlertas, avaliarAlertas } from './alertas'

const D = (n: number) => new Decimal(n)
const limites = {
  horizonteAporteMeses: 3,
  desvio: '0.05',
  inadimplenciaAlta: '0.05',
  crescimentoInadimplencia: '0.2',
}
const base: EntradaAlertas = {
  hoje: '2026-11-09',
  dataBase: '2026-01-01', // novembro = mês 10
  atual: {
    necessidadeDeAporte: Array.from({ length: 24 }, () => D(0)),
    custos: D(1000),
    exposicaoMaxima: D(500),
  },
  plano: { custos: D(1000), exposicaoMaxima: D(500) },
  inadimplencia: [],
}

describe('alertas de risco', () => {
  it('sem riscos, sem alertas', () => {
    expect(avaliarAlertas(base, limites)).toEqual([])
    expect(avaliarAlertas({ ...base, atual: null, plano: null }, limites)).toEqual([])
    // Sem plano aprovado: não há o que comparar.
    expect(
      avaliarAlertas(
        { ...base, atual: { ...base.atual!, custos: D(9_999) }, plano: null },
        limites,
      ),
    ).toEqual([])
  })

  it('aporte nos próximos meses: crítico se for já neste mês', () => {
    const aporte = base.atual!.necessidadeDeAporte.map((v, i) =>
      i === 11 || i === 12 ? D(10_000) : i === 9 || i === 13 ? D(1) : v,
    )
    expect(
      avaliarAlertas({ ...base, atual: { ...base.atual!, necessidadeDeAporte: aporte } }, limites),
    ).toEqual([{ tipo: 'aporte', gravidade: 'atencao', mes: 11, valorCentavos: 20_000, meses: 2 }])
    const agora = aporte.map((v, i) => (i === 10 ? D(5) : v))
    expect(
      avaliarAlertas(
        { ...base, atual: { ...base.atual!, necessidadeDeAporte: agora } },
        limites,
      )[0],
    ).toMatchObject({
      tipo: 'aporte',
      gravidade: 'critico',
      mes: 10,
      valorCentavos: 20_005,
    })
  })

  it('custos e exposição acima do plano; plano zerado não compara', () => {
    const r = avaliarAlertas(
      { ...base, atual: { ...base.atual!, custos: D(1080), exposicaoMaxima: D(700) } },
      limites,
    )
    expect(r).toEqual([
      {
        tipo: 'exposicao',
        gravidade: 'critico',
        valorCentavos: 700,
        referenciaCentavos: 500,
        excesso: '0.4',
      },
      {
        tipo: 'custo',
        gravidade: 'atencao',
        valorCentavos: 1080,
        referenciaCentavos: 1000,
        excesso: '0.08',
      },
    ])
    expect(
      avaliarAlertas({ ...base, plano: { custos: D(0), exposicaoMaxima: D(0) } }, limites),
    ).toEqual([])
  })

  it('inadimplência alta, crescente ou estável', () => {
    const p = (data: string, vencido: number, saldo: number) => ({
      data,
      vencidoCentavos: vencido,
      saldoCentavos: saldo,
    })
    expect(
      avaliarAlertas(
        { ...base, inadimplencia: [p('2026-09-09', 100, 10_000), p('2026-11-09', 1_200, 10_000)] },
        limites,
      ),
    ).toEqual([
      {
        tipo: 'inadimplencia',
        gravidade: 'critico',
        taxa: '0.12',
        taxaAnterior: '0.01',
        vencidoCentavos: 1_200,
        crescente: true,
      },
    ])
    expect(
      avaliarAlertas(
        { ...base, inadimplencia: [p('2026-09-09', 0, 10_000), p('2026-11-09', 300, 10_000)] },
        limites,
      )[0],
    ).toMatchObject({
      gravidade: 'atencao',
      crescente: true,
    })
    // Estável e abaixo do limite: sem alerta; só um ponto e abaixo do limite: sem alerta.
    expect(
      avaliarAlertas(
        { ...base, inadimplencia: [p('2026-09-09', 200, 10_000), p('2026-11-09', 210, 10_000)] },
        limites,
      ),
    ).toEqual([])
    expect(
      avaliarAlertas({ ...base, inadimplencia: [p('2026-11-09', 300, 10_000)] }, limites),
    ).toEqual([])
    expect(avaliarAlertas({ ...base, inadimplencia: [p('2026-11-09', 300, 0)] }, limites)).toEqual(
      [],
    )
    expect(
      avaliarAlertas({ ...base, inadimplencia: [p('2026-11-09', 0, 10_000)] }, limites),
    ).toEqual([])
  })
})
