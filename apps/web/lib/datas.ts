/** Mês atual em São Paulo, no formato AAAA-MM (para o campo de mês de início). */
export function mesAtualSaoPaulo(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(agora)
  const ano = partes.find((p) => p.type === 'year')?.value
  const mes = partes.find((p) => p.type === 'month')?.value
  return `${ano}-${mes}`
}
