import { Decimal } from './decimal'
import { ErroMotor } from './fluxo'

/** Participação de um sócio, vigente em [inicio, fim) — RN-S01. */
export interface Participacao {
  socio: string
  /** Fração (0,4 = 40%). */
  percentual: Decimal
  inicio: string
  fim: string | null
}

/** Chave do resultado sem sócio vigente (participações somando menos de 100%). */
export const SEM_SOCIO = ''

/**
 * Rateia cada valor pela participação vigente na data dele (RN-S01). O que não tem sócio
 * vigente fica em `SEM_SOCIO`, de modo que a soma do rateio é sempre igual à soma dos valores.
 */
export function ratearPorSocio(
  valores: readonly { data: string; valor: Decimal }[],
  participacoes: readonly Participacao[],
): Map<string, Decimal> {
  for (const p of participacoes)
    if (p.percentual.isNegative() || p.percentual.gt(1) || (p.fim !== null && p.fim <= p.inicio))
      throw new ErroMotor(`Participação inválida do sócio ${p.socio}.`)
  const resultado = new Map<string, Decimal>()
  const somar = (socio: string, v: Decimal) =>
    resultado.set(socio, (resultado.get(socio) ?? new Decimal(0)).plus(v))
  for (const { data, valor } of valores) {
    const vigentes = participacoes.filter(
      (p) => p.inicio <= data && (p.fim === null || data < p.fim),
    )
    const total = vigentes.reduce((t, p) => t.plus(p.percentual), new Decimal(0))
    if (total.gt(1)) throw new ErroMotor(`Participações somam mais de 100% em ${data}.`)
    for (const p of vigentes) somar(p.socio, valor.times(p.percentual))
    if (total.lt(1)) somar(SEM_SOCIO, valor.times(new Decimal(1).minus(total)))
  }
  return resultado
}
