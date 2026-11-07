import { Decimal } from './decimal'
import { ErroMotor, type FluxoMensal } from './fluxo'
import { type Taxa, mensalParaAnual } from './taxa'

const ZERO = new Decimal(0)
const UM = new Decimal(1)

function exigirMesmaBase(fluxo: FluxoMensal, taxa: Taxa) {
  if (fluxo.base !== taxa.base) {
    throw new ErroMotor(
      `Fluxo em valores ${fluxo.base}s descontado por taxa ${taxa.base}: use a mesma base (RN-F11).`,
    )
  }
}

/** Valor presente à taxa mensal (o mês 0 não é descontado — RN-F04). */
function valorPresente(valores: readonly Decimal[], taxaMensal: Decimal): Decimal {
  const fator = UM.div(taxaMensal.plus(1))
  let desconto = UM
  let soma = ZERO
  for (const v of valores) {
    soma = soma.plus(v.times(desconto))
    desconto = desconto.times(fator)
  }
  return soma
}

/** RN-F07: VPL à TMA do usuário (nunca à taxa do contrato do comprador). */
export function vpl(fluxo: FluxoMensal, tma: Taxa): Decimal {
  exigirMesmaBase(fluxo, tma)
  return valorPresente(fluxo.valores, tma.mensal)
}

/** Saldo acumulado mês a mês. */
export function acumulado(valores: readonly Decimal[]): Decimal[] {
  let saldo = ZERO
  return valores.map((v) => (saldo = saldo.plus(v)))
}

/** Quantas vezes o sinal do fluxo troca (ignorando zeros). */
export function trocasDeSinal(valores: readonly Decimal[]): number {
  let anterior = 0
  let trocas = 0
  for (const v of valores) {
    const s = v.isZero() ? 0 : v.isPositive() ? 1 : -1
    if (s === 0) continue
    if (anterior !== 0 && s !== anterior) trocas++
    anterior = s
  }
  return trocas
}

/**
 * Raiz de f no intervalo por bisseção, a partir de um intervalo com troca de sinal.
 * Devolve nulo se não encontrar troca de sinal até o limite superior.
 */
function bissecao(f: (r: Decimal) => Decimal, minimo: Decimal, limite: Decimal): Decimal | null {
  let lo = minimo
  let hi = new Decimal('0.1')
  const fLo = f(lo)
  let fHi = f(hi)
  while (fLo.isPositive() === fHi.isPositive() && hi.lt(limite)) {
    hi = hi.times(10)
    fHi = f(hi)
  }
  if (fLo.isPositive() === fHi.isPositive()) return null
  const tolerancia = new Decimal('1e-14')
  while (hi.minus(lo).gt(tolerancia)) {
    const meio = lo.plus(hi).div(2)
    const fMeio = f(meio)
    if (fMeio.isZero()) return meio
    if (fMeio.isPositive() === fLo.isPositive()) lo = meio
    else hi = meio
  }
  return lo.plus(hi).div(2)
}

export interface ResultadoTir {
  /** Nula quando o fluxo não troca de sinal (não há TIR). */
  mensal: Decimal | null
  anual: Decimal | null
  trocasDeSinal: number
  /** RN-F06: mais de uma troca de sinal pode gerar mais de uma TIR — avisar, não escolher em silêncio. */
  possivelTirMultipla: boolean
}

/** TIR mensal do fluxo e anual equivalente (RN-F05). */
export function tir(fluxo: FluxoMensal): ResultadoTir {
  const trocas = trocasDeSinal(fluxo.valores)
  const mensal =
    trocas === 0
      ? null
      : bissecao((r) => valorPresente(fluxo.valores, r), new Decimal('-0.99'), new Decimal(1000))
  return {
    mensal,
    anual: mensal === null ? null : mensalParaAnual(mensal),
    trocasDeSinal: trocas,
    possivelTirMultipla: trocas > 1,
  }
}

/** Primeiro mês em que o saldo volta a ser ≥ 0 depois de negativo (RN-F08). */
function primeiroMesRecuperado(saldos: readonly Decimal[]): number | null {
  let ficouNegativo = false
  for (const [mes, s] of saldos.entries()) {
    if (s.isNegative()) ficouNegativo = true
    else if (ficouNegativo) return mes
  }
  return ficouNegativo ? null : 0
}

export function paybackSimples(fluxo: FluxoMensal): number | null {
  return primeiroMesRecuperado(acumulado(fluxo.valores))
}

export function paybackDescontado(fluxo: FluxoMensal, tma: Taxa): number | null {
  exigirMesmaBase(fluxo, tma)
  const fator = UM.div(tma.mensal.plus(1))
  let desconto = UM
  const descontados = fluxo.valores.map((v) => {
    const d = v.times(desconto)
    desconto = desconto.times(fator)
    return d
  })
  return primeiroMesRecuperado(acumulado(descontados))
}

/** RN-F09: menor saldo acumulado (em valor absoluto) e o mês em que ocorre. */
export function exposicaoMaxima(fluxo: FluxoMensal): { valor: Decimal; mes: number } {
  let pior = ZERO
  let mes = 0
  for (const [m, s] of acumulado(fluxo.valores).entries()) {
    if (s.lt(pior)) {
      pior = s
      mes = m
    }
  }
  return { valor: pior.negated(), mes }
}

/**
 * Aporte necessário em cada mês para que o caixa acumulado nunca fique abaixo do
 * mínimo informado (centavos). Os aportes entram no caixa e se acumulam.
 */
export function necessidadeDeAporte(fluxo: FluxoMensal, caixaMinimo: Decimal = ZERO): Decimal[] {
  let aportado = ZERO
  return acumulado(fluxo.valores).map((saldo) => {
    const falta = caixaMinimo.minus(saldo.plus(aportado))
    const aporte = falta.isPositive() ? falta : ZERO
    aportado = aportado.plus(aporte)
    return aporte
  })
}

export interface FluxoComData {
  /** AAAA-MM-DD */
  data: string
  valor: Decimal
}

function dias(data: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data)
  if (!m) throw new ErroMotor(`Data inválida: ${data}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000
}

/** XIRR: taxa ANUAL com as datas reais de cada valor (base 365 dias — RN-F05). */
export function xirr(fluxos: readonly FluxoComData[]): Decimal | null {
  if (fluxos.length === 0) return null
  const inicio = Math.min(...fluxos.map((f) => dias(f.data)))
  const pontos = fluxos.map((f) => ({
    anos: new Decimal(dias(f.data) - inicio).div(365),
    valor: f.valor,
  }))
  if (trocasDeSinal(pontos.map((p) => p.valor)) === 0) return null
  const f = (r: Decimal) =>
    pontos.reduce((s, p) => s.plus(p.valor.div(r.plus(1).pow(p.anos))), ZERO)
  return bissecao(f, new Decimal('-0.99'), new Decimal(1000))
}
