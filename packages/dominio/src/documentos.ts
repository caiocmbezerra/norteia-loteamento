/** CPF e CNPJ: só dígitos e dígitos verificadores (módulo 11). */

export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, '')
}

function digito(base: string, pesos: number[]): number {
  const soma = [...base].reduce((t, d, i) => t + Number(d) * pesos[i]!, 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

export function cpfValido(texto: string): boolean {
  const c = soDigitos(texto)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const d1 = digito(c.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digito(c.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
  return c.endsWith(`${d1}${d2}`)
}

export function cnpjValido(texto: string): boolean {
  const c = soDigitos(texto)
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  const d1 = digito(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const d2 = digito(c.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return c.endsWith(`${d1}${d2}`)
}
