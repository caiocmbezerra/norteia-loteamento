import { Decimal } from '@norteia/motor-financeiro'
import type { VendaReal } from './vendas'

/**
 * Permuta financeira (RN-T03, RN-T04): o permutante recebe `percentual` da base a cada evento.
 * - 'recebido': tudo o que o comprador paga (principal, juros e encargos);
 * - 'principal': só a amortização recebida;
 * - 'vgv': o preço de cada venda, devido na data da venda.
 * Com `abateDistrato`, a devolução paga no distrato (bases recebidas) ou o preço da venda
 * distratada (base VGV) reduz o repasse.
 */
export interface PermutaFinanceira {
  id: string
  percentual: string
  base: 'recebido' | 'principal' | 'vgv'
  abateDistrato: boolean
  /** Eventos antes desta data não geram repasse. */
  inicio: string
  pagos: readonly { data: string; valorCentavos: number }[]
}

export interface LinhaRepasse {
  data: string
  descricao: string
  baseCentavos: number
  repasseCentavos: number
}

export interface ApuracaoRepasse {
  linhas: LinhaRepasse[]
  devidoCentavos: number
  pagoCentavos: number
  /** Devido − pago; negativo = crédito da loteadora. */
  saldoCentavos: number
}

const inteiro = (d: Decimal) => Number(d.toDecimalPlaces(0).toFixed(0))

/** Extrato do permutante até `hoje` (RN-T05): só fatos, nunca digitado. */
export function apurarRepasses(
  p: PermutaFinanceira,
  vendas: readonly VendaReal[],
  hoje: string,
): ApuracaoRepasse {
  const pct = new Decimal(p.percentual)
  const linhas: LinhaRepasse[] = []
  const lancar = (data: string, descricao: string, base: Decimal) => {
    if (data < p.inicio || data > hoje || base.isZero()) return
    linhas.push({
      data,
      descricao,
      baseCentavos: inteiro(base),
      repasseCentavos: inteiro(base.times(pct)),
    })
  }
  for (const v of vendas) {
    const rotulo = v.rotulo ?? 'Venda'
    if (p.base === 'vgv') {
      lancar(v.dataVenda, `${rotulo} · venda`, new Decimal(v.precoCentavos))
      if (v.distrato && p.abateDistrato && v.distrato.data)
        lancar(v.distrato.data, `${rotulo} · distrato`, new Decimal(v.precoCentavos).negated())
      continue
    }
    for (const pc of v.contrato ?? []) {
      const fracao = new Decimal(pc.amortizacaoCentavos + pc.correcaoCentavos).div(pc.valorCentavos)
      const nome = pc.numero === 0 ? 'entrada' : `parcela ${pc.numero}`
      for (const r of pc.recebimentos) {
        const base =
          p.base === 'principal'
            ? new Decimal(r.principalCentavos).times(fracao)
            : new Decimal(r.principalCentavos + r.encargosCentavos)
        lancar(r.data, `${rotulo} · ${nome}`, base)
      }
    }
    if (v.distrato && p.abateDistrato)
      for (const d of v.distrato.devolucoes)
        if (d.pagoEm)
          lancar(
            d.pagoEm,
            `${rotulo} · devolução do distrato`,
            new Decimal(d.valorCentavos).negated(),
          )
  }
  linhas.sort((a, b) => a.data.localeCompare(b.data))
  const devido = linhas.reduce((t, l) => t + l.repasseCentavos, 0)
  const pago = p.pagos.filter((x) => x.data <= hoje).reduce((t, x) => t + x.valorCentavos, 0)
  return { linhas, devidoCentavos: devido, pagoCentavos: pago, saldoCentavos: devido - pago }
}
