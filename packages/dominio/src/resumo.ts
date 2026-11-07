import { type Centavos, ZERO, centavos, somar } from '@norteia/motor-financeiro'
import type { StatusLote } from './cadastro'

export interface LoteParaResumo {
  status: StatusLote
  area_m2: number | string
  preco_base_centavos: number | null
}

export interface ResumoLotes {
  total: number
  porStatus: Record<StatusLote, number>
  /** Área total dos lotes, em m², com duas casas. */
  areaM2: string
  /**
   * Soma dos preços de referência dos lotes comercializáveis (exclui permuta).
   * É valor COMERCIAL de estoque, nunca caixa (RN-F10).
   */
  vgvTabelaCentavos: Centavos
  lotesSemPreco: number
}

export function resumirLotes(lotes: readonly LoteParaResumo[]): ResumoLotes {
  const porStatus: Record<StatusLote, number> = {
    disponivel: 0,
    reservado: 0,
    vendido: 0,
    bloqueado: 0,
    permuta: 0,
  }
  let areaCentesimos = 0n
  let vgv = ZERO
  let lotesSemPreco = 0
  for (const l of lotes) {
    porStatus[l.status]++
    const [inteiro = '0', dec = ''] = String(l.area_m2).split('.')
    areaCentesimos += BigInt(inteiro) * 100n + BigInt((dec + '00').slice(0, 2))
    if (l.status === 'permuta') continue
    if (l.preco_base_centavos === null) lotesSemPreco++
    else vgv = somar(vgv, centavos(l.preco_base_centavos))
  }
  const area = `${areaCentesimos / 100n}.${String(areaCentesimos % 100n).padStart(2, '0')}`
  return { total: lotes.length, porStatus, areaM2: area, vgvTabelaCentavos: vgv, lotesSemPreco }
}
