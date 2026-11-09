import { Decimal } from '@norteia/motor-financeiro'
import { mesDoFluxo } from './datas'

/**
 * Alertas de risco de um empreendimento (Fase 8c), a partir do fluxo do motor e da carteira.
 * Só compara números já calculados com os limites do cliente (parâmetros com vigência); não
 * projeta nada novo. Valores em centavos.
 */
export interface EntradaAlertas {
  /** AAAA-MM-DD */
  hoje: string
  /** Data-base do fluxo (mês 0). */
  dataBase: string
  atual: { necessidadeDeAporte: Decimal[]; custos: Decimal; exposicaoMaxima: Decimal } | null
  plano: { custos: Decimal; exposicaoMaxima: Decimal } | null
  /** Carteira em datas passadas, da mais antiga para a mais recente (a última é hoje). */
  inadimplencia: { data: string; vencidoCentavos: number; saldoCentavos: number }[]
}

export interface LimitesAlertas {
  /** Meses à frente para avisar de aporte. */
  horizonteAporteMeses: number
  /** Fração acima do plano que vira alerta (custos e exposição). */
  desvio: Decimal | string
  /** Vencido ÷ saldo da carteira a partir do qual a inadimplência é alta. */
  inadimplenciaAlta: Decimal | string
  /** Aumento relativo da taxa de inadimplência no período que vira alerta. */
  crescimentoInadimplencia: Decimal | string
}

export type Gravidade = 'atencao' | 'critico'

export type Alerta =
  | { tipo: 'aporte'; gravidade: Gravidade; mes: number; valorCentavos: number; meses: number }
  | {
      tipo: 'custo' | 'exposicao'
      gravidade: Gravidade
      valorCentavos: number
      referenciaCentavos: number
      excesso: string
    }
  | {
      tipo: 'inadimplencia'
      gravidade: Gravidade
      taxa: string
      taxaAnterior: string
      vencidoCentavos: number
      crescente: boolean
    }

const inteiro = (d: Decimal) => Number(d.toDecimalPlaces(0).toFixed(0))
const taxa = (p: { vencidoCentavos: number; saldoCentavos: number }) =>
  p.saldoCentavos > 0 ? new Decimal(p.vencidoCentavos).div(p.saldoCentavos) : new Decimal(0)

function acimaDoPlano(
  tipo: 'custo' | 'exposicao',
  atual: Decimal,
  plano: Decimal,
  desvio: Decimal,
): Alerta | null {
  if (!plano.gt(0)) return null
  const excesso = atual.div(plano).minus(1)
  if (excesso.lte(desvio)) return null
  return {
    tipo,
    gravidade: excesso.gt(desvio.times(2)) ? 'critico' : 'atencao',
    valorCentavos: inteiro(atual),
    referenciaCentavos: inteiro(plano),
    excesso: excesso.toDecimalPlaces(4).toString(),
  }
}

export function avaliarAlertas(e: EntradaAlertas, l: LimitesAlertas): Alerta[] {
  const alertas: Alerta[] = []
  const desvio = new Decimal(l.desvio)

  if (e.atual) {
    const agora = mesDoFluxo(e.dataBase, e.hoje)
    const janela = e.atual.necessidadeDeAporte
      .map((valor, mes) => ({ valor, mes }))
      .filter((x) => x.mes >= agora && x.mes < agora + l.horizonteAporteMeses && x.valor.gt(0))
    if (janela.length > 0)
      alertas.push({
        tipo: 'aporte',
        gravidade: janela[0]!.mes === agora ? 'critico' : 'atencao',
        mes: janela[0]!.mes,
        valorCentavos: inteiro(janela.reduce((t, x) => t.plus(x.valor), new Decimal(0))),
        meses: janela.length,
      })
    if (e.plano) {
      const custo = acimaDoPlano('custo', e.atual.custos, e.plano.custos, desvio)
      if (custo) alertas.push(custo)
      const exposicao = acimaDoPlano(
        'exposicao',
        e.atual.exposicaoMaxima,
        e.plano.exposicaoMaxima,
        desvio,
      )
      if (exposicao) alertas.push(exposicao)
    }
  }

  const ultimo = e.inadimplencia.at(-1)
  if (ultimo && ultimo.vencidoCentavos > 0) {
    const primeiro = e.inadimplencia[0]!
    const agora = taxa(ultimo)
    const antes = taxa(primeiro)
    const alta = new Decimal(l.inadimplenciaAlta)
    const crescente = antes.isZero()
      ? agora.gt(0)
      : agora.div(antes).minus(1).gt(l.crescimentoInadimplencia)
    if (agora.gte(alta) || (crescente && e.inadimplencia.length > 1))
      alertas.push({
        tipo: 'inadimplencia',
        gravidade: agora.gte(alta.times(2)) ? 'critico' : 'atencao',
        taxa: agora.toDecimalPlaces(4).toString(),
        taxaAnterior: antes.toDecimalPlaces(4).toString(),
        vencidoCentavos: ultimo.vencidoCentavos,
        crescente,
      })
  }

  const peso = (a: Alerta) => (a.gravidade === 'critico' ? 0 : 1)
  return alertas.sort((a, b) => peso(a) - peso(b))
}
