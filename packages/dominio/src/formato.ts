import { type Centavos, Decimal, centavos, emReais } from '@norteia/motor-financeiro'

/** Formatos brasileiros usados em telas, PDFs e mensagens (RN-G08). */

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** `R$ 1.234,56` (com espaço inseparável, como o padrão do Intl). */
export function formatarMoeda(valor: Centavos): string {
  // Valores seguros com 2 casas são representados exatamente após toFixed(2).
  return moeda.format(Number(emReais(valor).toFixed(2)))
}

export class ErroFormato extends Error {
  override readonly name = 'ErroFormato'
}

const PADRAO_MOEDA = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/

/**
 * Lê um valor digitado no formato brasileiro e devolve centavos.
 * Aceita `R$ 1.234,56`, `1234,56`, `1.234`, `-10,5`. Recusa formatos ambíguos.
 */
export function lerMoeda(texto: string): Centavos {
  const limpo = texto.replace(/R\$/u, '').replace(/\s/gu, '') // \s inclui o espaço inseparável
  if (!PADRAO_MOEDA.test(limpo)) {
    throw new ErroFormato(`Valor monetário inválido: "${texto}"`)
  }
  const normalizado = limpo.replace(/\./g, '').replace(',', '.')
  return centavos(BigInt(new Decimal(normalizado).times(100).toFixed(0)))
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Data de negócio (`AAAA-MM-DD`, sem fuso) → `dd/mm/aaaa`.
 * Não usa `Date` para não sofrer deslocamento de fuso horário.
 */
export function formatarData(dataIso: string): string {
  const m = DATA_ISO.exec(dataIso)
  if (!m) {
    throw new ErroFormato(`Data inválida: "${dataIso}"`)
  }
  return `${m[3]}/${m[2]}/${m[1]}`
}

/** `dd/mm/aaaa` → `AAAA-MM-DD`, validando dia, mês e ano bissexto. */
export function lerData(texto: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim())
  if (!m) {
    throw new ErroFormato(`Data inválida: "${texto}"`)
  }
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  if (mes < 1 || mes > 12 || dia < 1 || dia > ultimoDia) {
    throw new ErroFormato(`Data inexistente: "${texto}"`)
  }
  return `${m[3]}-${m[2]}-${m[1]}`
}

/**
 * Fração → percentual brasileiro. `0.0148` → `1,48%`.
 * Recebe Decimal ou string para não perder precisão.
 */
export function formatarPercentual(fracao: Decimal | string, casas = 2): string {
  const valor = new Decimal(fracao).times(100).toFixed(casas)
  const [inteiro = '0', decimais] = valor.split('.')
  const negativo = inteiro.startsWith('-')
  const digitos = negativo ? inteiro.slice(1) : inteiro
  const comMilhar = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negativo ? '-' : ''}${comMilhar}${decimais ? `,${decimais}` : ''}%`
}
