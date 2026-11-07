/** Aceita só caminhos internos (evita redirecionamento aberto para outro site). */
export function destinoSeguro(proximo: unknown, padrao = '/painel'): string {
  if (typeof proximo !== 'string') return padrao
  if (!proximo.startsWith('/') || proximo.startsWith('//') || proximo.startsWith('/\\'))
    return padrao
  return proximo
}
