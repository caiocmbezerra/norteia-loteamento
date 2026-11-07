import { Decimal } from './decimal'
import { centavos } from './dinheiro'
import { ErroMotor } from './fluxo'
import {
  type PremissasViabilidade,
  type ResumoViabilidade,
  projetarViabilidade,
  resumirViabilidade,
} from './viabilidade'
import type { Taxa } from './taxa'

/** Choques de estresse sobre as premissas (docs/dominio.md, Fase 2). */
export type Choque =
  | { tipo: 'velocidade_vendas'; lotesPorMes: number }
  /** Multiplica o preço do lote (0,9 = 10% mais barato). */
  | { tipo: 'preco'; fator: Decimal }
  /** Multiplica os custos de um centro de custo (1,15 = 15% mais caro). */
  | { tipo: 'custo'; centroCusto: string; fator: Decimal }
  | { tipo: 'inadimplencia'; fracao: Decimal }
  /** Atrasa o início das vendas em N meses (ex.: demora no registro do loteamento). */
  | { tipo: 'atraso_vendas'; meses: number }

/** Aplica os choques em sequência, sem alterar as premissas originais. */
export function aplicarChoques(
  premissas: PremissasViabilidade,
  choques: readonly Choque[],
): PremissasViabilidade {
  let p: PremissasViabilidade = {
    ...premissas,
    vendas: { ...premissas.vendas },
    pagamento: { ...premissas.pagamento },
    custos: premissas.custos.map((c) => ({ ...c })),
  }
  for (const c of choques) {
    switch (c.tipo) {
      case 'velocidade_vendas':
        p = { ...p, vendas: { ...p.vendas, lotesPorMes: c.lotesPorMes } }
        break
      case 'preco':
        p = {
          ...p,
          precoLoteCentavos: centavos(
            BigInt(new Decimal(p.precoLoteCentavos).times(c.fator).toFixed(0)),
          ),
        }
        break
      case 'custo': {
        if (!p.custos.some((x) => x.centroCusto === c.centroCusto)) {
          throw new ErroMotor(`Centro de custo inexistente nas premissas: ${c.centroCusto}`)
        }
        p = {
          ...p,
          custos: p.custos.map((x) =>
            x.centroCusto === c.centroCusto
              ? {
                  ...x,
                  valorCentavos: centavos(
                    BigInt(new Decimal(x.valorCentavos).times(c.fator).toFixed(0)),
                  ),
                }
              : x,
          ),
        }
        break
      }
      case 'inadimplencia':
        p = { ...p, inadimplencia: c.fracao }
        break
      case 'atraso_vendas':
        p = { ...p, vendas: { ...p.vendas, mesInicio: p.vendas.mesInicio + c.meses } }
        break
    }
  }
  return p
}

/** Resumo do cenário estressado. */
export function estressar(
  premissas: PremissasViabilidade,
  choques: readonly Choque[],
  tma: Taxa,
): ResumoViabilidade {
  return resumirViabilidade(projetarViabilidade(aplicarChoques(premissas, choques)), tma)
}

/**
 * Matriz de sensibilidade: TIR anual para cada combinação de um choque do eixo X com um
 * do eixo Y. Células sem TIR ficam nulas.
 */
export function matrizSensibilidade(
  premissas: PremissasViabilidade,
  eixoX: readonly Choque[],
  eixoY: readonly Choque[],
  tma: Taxa,
): (Decimal | null)[][] {
  return eixoY.map((y) => eixoX.map((x) => estressar(premissas, [x, y], tma).tir.anual))
}
