import { CASO_REFERENCIA, totalPorCategoria } from '@norteia/motor-financeiro'
import { describe, expect, it } from 'vitest'
import {
  type ParcelaReal,
  type PermutaFinanceira,
  type VendaReal,
  apurarRepasses,
  projetarReceitas,
} from './index'

const parcela = (o: Partial<ParcelaReal>): ParcelaReal => ({
  numero: 1,
  vencimento: '2026-03-10',
  valorCentavos: 50_000,
  amortizacaoCentavos: 40_000,
  jurosCentavos: 10_000,
  correcaoCentavos: 0,
  situacao: 'paga',
  recebimentos: [],
  ...o,
})
const venda = (o: Partial<VendaReal> = {}): VendaReal => ({
  dataVenda: '2026-02-10',
  precoCentavos: 100_000,
  entradaCentavos: 50_000,
  parcelas: 1,
  jurosMensal: '0',
  sistema: 'price',
  primeiraParcelaEm: '2026-03-10',
  comissaoPercentual: '0',
  comissaoModo: 'ato',
  rotulo: 'Quadra A · Lote 1',
  contrato: [
    parcela({
      recebimentos: [{ data: '2026-03-12', principalCentavos: 50_000, encargosCentavos: 1_000 }],
    }),
    parcela({ numero: 2, situacao: 'aberta', vencimento: '2026-09-10' }),
  ],
  ...o,
})
const permuta = (o: Partial<PermutaFinanceira> = {}): PermutaFinanceira => ({
  id: 'p1',
  percentual: '0.1',
  base: 'recebido',
  abateDistrato: false,
  inicio: '2026-01-01',
  pagos: [],
  ...o,
})
const hoje = '2026-06-15'

describe('apurarRepasses (RN-T03 a RN-T05)', () => {
  it('base recebido: 10% de cada recebimento até hoje, encargos incluídos', () => {
    const a = apurarRepasses(
      permuta({
        pagos: [
          { data: '2026-04-01', valorCentavos: 3_000 },
          { data: '2026-12-01', valorCentavos: 9 },
        ],
      }),
      [
        venda(),
        venda({
          contrato: [
            parcela({
              recebimentos: [{ data: '2026-12-01', principalCentavos: 1, encargosCentavos: 0 }],
            }),
          ],
        }),
      ],
      hoje,
    )
    expect(a.linhas).toEqual([
      {
        data: '2026-03-12',
        descricao: 'Quadra A · Lote 1 · parcela 1',
        baseCentavos: 51_000,
        repasseCentavos: 5_100,
      },
    ])
    expect(a.pagoCentavos).toBe(3_000)
    expect(a.saldoCentavos).toBe(2_100)
  })

  it('base principal: só a amortização; eventos antes do início não contam', () => {
    expect(
      apurarRepasses(permuta({ base: 'principal' }), [venda()], hoje).linhas[0]!.repasseCentavos,
    ).toBe(4_000)
    expect(apurarRepasses(permuta({ inicio: '2026-04-01' }), [venda()], hoje).linhas).toEqual([])
    expect(
      apurarRepasses(
        permuta(),
        [
          Object.fromEntries(
            Object.entries(venda()).filter(([k]) => k !== 'contrato' && k !== 'rotulo'),
          ) as unknown as VendaReal,
        ],
        hoje,
      ).linhas,
    ).toEqual([])
  })

  it('distrato abate a devolução paga quando o contrato de permuta prevê', () => {
    const distratada = venda({
      contrato: [
        parcela({
          numero: 0,
          recebimentos: [{ data: '2026-02-10', principalCentavos: 50_000, encargosCentavos: 0 }],
          amortizacaoCentavos: 50_000,
          jurosCentavos: 0,
        }),
      ],
      distrato: {
        data: '2026-05-01',
        devolucoes: [
          { vencimento: '2026-05-10', valorCentavos: 20_000, pagoEm: '2026-05-10' },
          { vencimento: '2026-08-10', valorCentavos: 20_000, pagoEm: null },
        ],
      },
    })
    const sem = apurarRepasses(permuta(), [distratada], hoje)
    expect(sem.devidoCentavos).toBe(5_000)
    expect(sem.linhas[0]!.descricao).toBe('Quadra A · Lote 1 · entrada')
    const com = apurarRepasses(permuta({ abateDistrato: true }), [distratada], hoje)
    expect(com.devidoCentavos).toBe(3_000)
    expect(com.linhas.at(-1)!.descricao).toBe('Quadra A · Lote 1 · devolução do distrato')
  })

  it('base VGV: devido na venda; distrato com abate estorna', () => {
    const v = venda({ distrato: { data: '2026-05-01', devolucoes: [] } })
    expect(apurarRepasses(permuta({ base: 'vgv' }), [v], hoje).devidoCentavos).toBe(10_000)
    expect(
      apurarRepasses(permuta({ base: 'vgv', abateDistrato: true }), [v], hoje).devidoCentavos,
    ).toBe(0)
    expect(
      apurarRepasses(
        permuta({ base: 'vgv', abateDistrato: true }),
        [venda({ distrato: { devolucoes: [] } })],
        hoje,
      ).devidoCentavos,
    ).toBe(10_000)
  })
})

describe('projetarReceitas com permuta financeira', () => {
  const premissas = { ...CASO_REFERENCIA, lotesVendaveis: 3 }
  const projetar = (pm: PermutaFinanceira, vendas: VendaReal[] = [venda()]) =>
    projetarReceitas({
      dataBase: '2026-01-01',
      hoje,
      premissas,
      vendas,
      permutas: [pm],
    }).lancamentos.filter((l) => l.categoria === 'repasse_permuta')

  it('pago realizado, saldo comprometido, futuro na natureza das receitas', () => {
    const l = projetar(
      permuta({
        pagos: [
          { data: '2026-04-01', valorCentavos: 3_000 },
          { data: '2027-01-01', valorCentavos: 7 },
        ],
      }),
    )
    expect(l.find((x) => x.natureza === 'realizado')!.valor.toNumber()).toBe(-3_000)
    expect(l.find((x) => x.natureza === 'comprometido')!.valor.toNumber()).toBe(-2_100)
    expect(l.some((x) => x.natureza === 'carteira')).toBe(true)
    expect(l.some((x) => x.natureza === 'projetado')).toBe(true)
    const principal = projetar(permuta({ base: 'principal' }))
    expect(
      totalPorCategoria(principal)
        .repasse_permuta.abs()
        .lt(totalPorCategoria(l).repasse_permuta.abs().plus(3_000)),
    ).toBe(true)
  })

  it('base VGV sobre vendas projetadas; devolução futura abate quando previsto', () => {
    const vgv = projetar(permuta({ base: 'vgv' }))
    expect(
      vgv.filter((x) => x.natureza === 'projetado').reduce((s, x) => s + x.valor.toNumber(), 0),
    ).toBe(-2 * Number(CASO_REFERENCIA.precoLoteCentavos) * 0.1)
    const distratada = venda({
      distrato: {
        data: '2026-05-01',
        devolucoes: [
          { vencimento: '2026-08-10', valorCentavos: 20_000, pagoEm: null },
          { vencimento: '2026-05-10', valorCentavos: 1_000, pagoEm: '2026-05-10' },
        ],
      },
    })
    const abate = projetar(permuta({ abateDistrato: true, inicio: '2030-01-01' }), [
      distratada,
      venda(),
    ])
    expect(abate.filter((x) => x.valor.isPositive()).map((x) => x.valor.toNumber())).toEqual([
      2_000,
    ])
  })
})
