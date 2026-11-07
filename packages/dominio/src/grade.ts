import type { Centavos } from '@norteia/motor-financeiro'

/**
 * Geração automática de quadras e lotes em grade (D-008): o loteador informa quantas
 * quadras, quantos lotes por quadra, a área e o preço padrão; depois ajusta lote a lote.
 */

export const LIMITES_GRADE = {
  quadras: 200,
  lotesPorQuadra: 500,
  totalLotes: 5000,
} as const

export type EstiloQuadra = 'letra' | 'numero'

export interface ParametrosGrade {
  quadras: number
  lotesPorQuadra: number
  /** Área padrão em m², com ponto decimal (ex.: "300.00"). */
  areaM2: string
  precoBaseCentavos: Centavos | null
  estiloQuadra?: EstiloQuadra
}

export interface LoteDaGrade {
  quadra: string
  numero: string
  areaM2: string
  precoBaseCentavos: Centavos | null
}

export class ErroGrade extends Error {
  override readonly name = 'ErroGrade'
}

/** 0 → "A", 25 → "Z", 26 → "AA", 27 → "AB"… (como colunas de planilha). */
export function codigoQuadra(indice: number, estilo: EstiloQuadra = 'letra'): string {
  if (!Number.isInteger(indice) || indice < 0) {
    throw new ErroGrade(`Índice de quadra inválido: ${indice}`)
  }
  if (estilo === 'numero') {
    return String(indice + 1)
  }
  let n = indice + 1
  let codigo = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    codigo = String.fromCharCode(65 + resto) + codigo
    n = Math.floor((n - 1) / 26)
  }
  return codigo
}

export function gerarGrade(p: ParametrosGrade): LoteDaGrade[] {
  const { quadras, lotesPorQuadra } = p
  if (!Number.isInteger(quadras) || quadras < 1 || quadras > LIMITES_GRADE.quadras) {
    throw new ErroGrade(`Informe de 1 a ${LIMITES_GRADE.quadras} quadras.`)
  }
  if (
    !Number.isInteger(lotesPorQuadra) ||
    lotesPorQuadra < 1 ||
    lotesPorQuadra > LIMITES_GRADE.lotesPorQuadra
  ) {
    throw new ErroGrade(`Informe de 1 a ${LIMITES_GRADE.lotesPorQuadra} lotes por quadra.`)
  }
  if (quadras * lotesPorQuadra > LIMITES_GRADE.totalLotes) {
    throw new ErroGrade(`A grade automática gera no máximo ${LIMITES_GRADE.totalLotes} lotes.`)
  }
  if (!/^\d+(\.\d{1,2})?$/.test(p.areaM2) || Number(p.areaM2) <= 0) {
    throw new ErroGrade('A área padrão deve ser maior que zero.')
  }

  const lotes: LoteDaGrade[] = []
  for (let q = 0; q < quadras; q++) {
    const quadra = codigoQuadra(q, p.estiloQuadra)
    for (let l = 1; l <= lotesPorQuadra; l++) {
      lotes.push({
        quadra,
        numero: String(l),
        areaM2: p.areaM2,
        precoBaseCentavos: p.precoBaseCentavos,
      })
    }
  }
  return lotes
}
