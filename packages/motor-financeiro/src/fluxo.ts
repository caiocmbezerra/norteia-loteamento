import { Decimal } from './decimal'

/**
 * Fluxo de caixa único (RN-F01, RN-F02). Valores em CENTAVOS como Decimal: projeções
 * (inadimplência, parcelas) geram frações de centavo, que só são arredondadas na exibição
 * ou na persistência. Sinal: positivo entra no caixa, negativo sai.
 */

export type Natureza = 'realizado' | 'comprometido' | 'carteira' | 'projetado'

export type Categoria =
  | 'receita_imobiliaria'
  | 'receita_juros'
  | 'custo'
  | 'comissao'
  | 'tributo'
  | 'aporte'
  | 'distribuicao'
  | 'repasse_permuta'
  | 'devolucao_distrato'

/** Valores reais (moeda da data-base) ou nominais (com inflação projetada) — RN-F11. */
export type BaseMonetaria = 'real' | 'nominal'

export interface Lancamento {
  /** Mês do fluxo, contado a partir do mês 0 (RN-F04). */
  mes: number
  /** Centavos (com frações), positivo = entrada, negativo = saída. */
  valor: Decimal
  categoria: Categoria
  natureza: Natureza
  centroCusto: string
}

export interface FluxoMensal {
  base: BaseMonetaria
  /** Saldo líquido de cada mês, do mês 0 ao último mês com movimento. */
  valores: Decimal[]
}

export class ErroMotor extends Error {
  override readonly name = 'ErroMotor'
}

/** Categorias que formam o fluxo do empreendimento (sem movimentos com sócios). */
export const CATEGORIAS_DO_PROJETO: readonly Categoria[] = [
  'receita_imobiliaria',
  'receita_juros',
  'custo',
  'comissao',
  'tributo',
  'repasse_permuta',
  'devolucao_distrato',
]

export const CATEGORIAS_DE_RECEITA: readonly Categoria[] = ['receita_imobiliaria', 'receita_juros']

/** Soma os lançamentos por mês. Por padrão ignora aportes e distribuições (fluxo do projeto). */
export function agregarPorMes(
  lancamentos: readonly Lancamento[],
  base: BaseMonetaria,
  categorias: readonly Categoria[] = CATEGORIAS_DO_PROJETO,
): FluxoMensal {
  const valores: Decimal[] = []
  for (const l of lancamentos) {
    if (!Number.isInteger(l.mes) || l.mes < 0) {
      throw new ErroMotor(`Mês inválido no lançamento: ${l.mes}`)
    }
    if (!categorias.includes(l.categoria)) continue
    while (valores.length <= l.mes) valores.push(new Decimal(0))
    valores[l.mes] = valores[l.mes]!.plus(l.valor)
  }
  return { base, valores }
}

/** Total por categoria (zero para as que não aparecem). */
export function totalPorCategoria(lancamentos: readonly Lancamento[]): Record<Categoria, Decimal> {
  const total = {} as Record<Categoria, Decimal>
  for (const c of [...CATEGORIAS_DO_PROJETO, 'aporte', 'distribuicao'] as Categoria[]) {
    total[c] = new Decimal(0)
  }
  for (const l of lancamentos) total[l.categoria] = total[l.categoria].plus(l.valor)
  return total
}
