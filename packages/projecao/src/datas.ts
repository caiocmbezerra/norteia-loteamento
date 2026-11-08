/**
 * Mês do fluxo (RN-F04) correspondente a uma data real, a partir da data-base (mês 0).
 * Datas anteriores à data-base caem no mês 0.
 */
export function mesDoFluxo(dataBase: string, data: string): number {
  const [ab, mb] = partes(dataBase)
  const [a, m] = partes(data)
  return Math.max(0, (a - ab) * 12 + (m - mb))
}

function partes(data: string): [number, number] {
  const r = /^(\d{4})-(\d{2})-\d{2}$/.exec(data)
  if (!r) throw new Error(`Data inválida: ${data}`)
  return [Number(r[1]), Number(r[2])]
}
