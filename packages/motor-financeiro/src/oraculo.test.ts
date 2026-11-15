/**
 * Auditoria de QA (docs/qa-norteia-loteamento): oráculo matemático INDEPENDENTE do motor.
 *
 * O oráculo usa só BigInt (frações exatas) e um calendário próprio — nada de decimal.js nem de
 * funções do motor. Cada caso compara o motor com o oráculo, parcela a parcela, em centavos.
 * Regras de arredondamento seguidas pelo oráculo (as documentadas no motor): meio-para-par
 * (ROUND_HALF_EVEN), juros de cada mês arredondados, prestação Price arredondada uma vez e
 * diferença na última parcela (RN-K02); encargos = multa única + juros simples pro rata dia,
 * mês de 30 dias, dias corridos (RN-K04).
 *
 * IDs do catálogo: MOT-UNID-1xx (Price/SAC), MOT-UNID-2xx (encargos), MOT-UNID-3xx (datas),
 * MOT-UNID-4xx (antecipação), MOT-UNID-5xx (contrato).
 */
import { describe, expect, it } from 'vitest'
import {
  Decimal,
  calcularEncargos,
  centavos,
  descontoAntecipacao,
  diasEntre,
  gerarParcelasContrato,
  somarMeses,
  tabelaAmortizacao,
} from './index'

// ───────────────────────── Oráculo (BigInt puro) ─────────────────────────

/** Fração exata a partir de texto decimal ("0.005" → 5/1000). */
function fracao(texto: string): [bigint, bigint] {
  const [int, dec = ''] = texto.split('.')
  const den = 10n ** BigInt(dec.length)
  return [BigInt(int + dec), den]
}

/** n/d arredondado ao inteiro, meio-para-par. Aceita numerador negativo; d > 0. */
function meioParaPar(n: bigint, d: bigint): bigint {
  const neg = n < 0n
  const a = neg ? -n : n
  let q = a / d
  const r2 = (a % d) * 2n
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n
  return neg ? -q : q
}

interface LinhaOraculo {
  prestacao: bigint
  juros: bigint
  amortizacao: bigint
  saldo: bigint
}

function oraculoTabela(
  sistema: 'price' | 'sac',
  P: bigint,
  taxa: string,
  n: number,
): LinhaOraculo[] {
  const [a, b] = fracao(taxa)
  const N = BigInt(n)
  let prestacao: bigint
  if (a === 0n) prestacao = meioParaPar(P, N)
  else {
    const fator = (b + a) ** N // (1+i)^n · b^n
    const bn = b ** N
    prestacao = meioParaPar(P * a * fator, b * (fator - bn))
  }
  const amortSac = meioParaPar(P, N)
  const linhas: LinhaOraculo[] = []
  let saldo = P
  for (let k = 1; k <= n; k++) {
    const juros = meioParaPar(saldo * a, b)
    let amortizacao = sistema === 'price' ? prestacao - juros : amortSac
    if (k === n) amortizacao = saldo
    saldo -= amortizacao
    linhas.push({ prestacao: amortizacao + juros, juros, amortizacao, saldo })
  }
  return linhas
}

// Calendário próprio (algoritmo de dias civis, sem Date).
function diasCivis(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}
const bissexto = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
const diasNoMes = (y: number, m: number) =>
  [31, bissexto(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!
const partes = (s: string) => s.split('-').map(Number) as [number, number, number]
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function deDiasCivis(z0: number): string {
  const z = z0 + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return iso(yoe + era * 400 + (m <= 2 ? 1 : 0), m, d)
}

function oraculoDias(de: string, ate: string): number {
  return diasCivis(...partes(ate)) - diasCivis(...partes(de))
}
function oraculoSomarMeses(data: string, meses: number): string {
  const [y, m, d] = partes(data)
  const total = y * 12 + (m - 1) + meses
  const ano = Math.floor(total / 12)
  const mes = total - ano * 12 + 1
  return iso(ano, mes, Math.min(d, diasNoMes(ano, mes)))
}

// Gerador pseudoaleatório determinístico (mulberry32) — reprodutível em qualquer máquina.
function gerador(semente: number) {
  let s = semente >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const doMotor = (sistema: 'price' | 'sac', P: number, taxa: string, n: number) =>
  tabelaAmortizacao(sistema, new Decimal(P), new Decimal(taxa), n, {
    arredondarCentavos: true,
  }).map((p) => ({
    prestacao: BigInt(p.prestacao.toFixed(0)),
    juros: BigInt(p.juros.toFixed(0)),
    amortizacao: BigInt(p.amortizacao.toFixed(0)),
    saldo: BigInt(p.saldoDevedor.toFixed(0)),
  }))

const TAXAS = [
  '0',
  '0.001',
  '0.0035',
  '0.005',
  '0.0075',
  '0.008',
  '0.01',
  '0.0125',
  '0.015',
  '0.02',
]

// ───────────────────────── Price e SAC ─────────────────────────

describe('MOT-UNID-1xx — Price e SAC contra o oráculo BigInt', () => {
  it('MOT-UNID-101: caso fixo Price R$ 81.000,00, 0,5% a.m., 120x — tabela idêntica ao oráculo', () => {
    expect(doMotor('price', 8_100_000, '0.005', 120)).toEqual(
      oraculoTabela('price', 8_100_000n, '0.005', 120),
    )
  })

  it('MOT-UNID-102: caso fixo Price — prestação R$ 899,27 (fórmula fechada, conferida à mão)', () => {
    // 81000 × 0,005 / (1 − 1,005^−120) = 899,2714…  → 89927 centavos
    expect(oraculoTabela('price', 8_100_000n, '0.005', 120)[0]!.prestacao).toBe(89_927n)
    expect(doMotor('price', 8_100_000, '0.005', 120)[0]!.prestacao).toBe(89_927n)
  })

  it('MOT-UNID-103: caso fixo SAC R$ 100.000,00, 1% a.m., 100x — amortização 1.000,00 e juros decrescentes', () => {
    const t = doMotor('sac', 10_000_000, '0.01', 100)
    expect(t).toEqual(oraculoTabela('sac', 10_000_000n, '0.01', 100))
    expect(t[0]!.amortizacao).toBe(100_000n)
    expect(t[0]!.juros).toBe(100_000n)
    for (let k = 1; k < t.length; k++) expect(t[k]!.juros < t[k - 1]!.juros).toBe(true)
  })

  it('MOT-UNID-104: 600 contratos aleatórios (semente fixa) — motor = oráculo em todas as parcelas', () => {
    const rnd = gerador(20261115)
    for (let caso = 0; caso < 600; caso++) {
      const sistema = caso % 2 === 0 ? 'price' : 'sac'
      const P = 100 + Math.floor(rnd() * 50_000_000) // R$ 1,00 a R$ 500.000,00
      const taxa = TAXAS[Math.floor(rnd() * TAXAS.length)]!
      const n = 1 + Math.floor(rnd() * 240)
      expect(doMotor(sistema, P, taxa, n), `${sistema} P=${P} i=${taxa} n=${n}`).toEqual(
        oraculoTabela(sistema, BigInt(P), taxa, n),
      )
    }
  })

  it('MOT-UNID-105: propriedade — soma das amortizações = principal e saldo final = 0 (RN-K02, INV-001)', () => {
    const rnd = gerador(7)
    for (let caso = 0; caso < 400; caso++) {
      const sistema = caso % 2 === 0 ? 'price' : 'sac'
      const P = 1 + Math.floor(rnd() * 90_000_000)
      const n = 1 + Math.floor(rnd() * 480)
      const t = doMotor(sistema, P, TAXAS[caso % TAXAS.length]!, n)
      expect(t.reduce((s, p) => s + p.amortizacao, 0n)).toBe(BigInt(P))
      expect(t[t.length - 1]!.saldo).toBe(0n)
    }
  })

  it('MOT-UNID-106: propriedade — nenhuma amortização, juros ou saldo negativo até 2% a.m. e 480x (INV-002)', () => {
    const rnd = gerador(99)
    for (let caso = 0; caso < 300; caso++) {
      const sistema = caso % 2 === 0 ? 'price' : 'sac'
      const P = 1 + Math.floor(rnd() * 90_000_000)
      const n = 1 + Math.floor(rnd() * 480)
      for (const p of doMotor(sistema, P, TAXAS[caso % TAXAS.length]!, n)) {
        expect(p.amortizacao >= 0n && p.juros >= 0n && p.saldo >= 0n).toBe(true)
      }
    }
  })

  it('MOT-UNID-107: propriedade — prestação + valor = amortização + juros em todas as parcelas', () => {
    for (const p of doMotor('price', 12_345_678, '0.0125', 360))
      expect(p.prestacao).toBe(p.amortizacao + p.juros)
  })

  it('MOT-UNID-108: Price — prestações iguais exceto a última (RN-K02)', () => {
    const t = doMotor('price', 9_000_000, '0.005', 120)
    expect(new Set(t.slice(0, -1).map((p) => p.prestacao)).size).toBe(1)
  })

  it('MOT-UNID-109: juros zero — Price e SAC coincidem e não há juros', () => {
    const price = doMotor('price', 1_000_001, '0', 7)
    const sac = doMotor('sac', 1_000_001, '0', 7)
    expect(price).toEqual(sac)
    expect(price.every((p) => p.juros === 0n)).toBe(true)
    expect(price[6]!.amortizacao).toBe(1_000_001n - 6n * 142_857n)
  })

  it('MOT-UNID-110: parcela única — paga principal + um mês de juros', () => {
    expect(doMotor('price', 5_000_000, '0.01', 1)).toEqual([
      { prestacao: 5_050_000n, juros: 50_000n, amortizacao: 5_000_000n, saldo: 0n },
    ])
  })

  it('MOT-UNID-111: arredondamento meio-para-par nos juros (0,5 centavo vai para o par)', () => {
    // 25 centavos × 0,1 % … usamos 0,02 × 25 = 0,5 → 0 (par); 0,02 × 75 = 1,5 → 2 (par)
    expect(doMotor('sac', 25, '0.02', 1)[0]!.juros).toBe(0n)
    expect(doMotor('sac', 75, '0.02', 1)[0]!.juros).toBe(2n)
  })

  it('MOT-UNID-112: diferença da última parcela Price fica dentro do limite teórico do arredondamento', () => {
    // A prestação é arredondada uma vez (erro ≤ 0,5 centavo/mês) e o erro capitaliza à taxa
    // do contrato; a última parcela absorve ≤ 0,5·s(n) + n centavos.
    for (const [taxa, n] of [
      ['0.005', 120],
      ['0.01', 240],
      ['0.0075', 360],
    ] as const) {
      const t = doMotor('price', 9_000_000, taxa, n)
      const dif = t[n - 1]!.prestacao - t[0]!.prestacao
      const i = Number(taxa)
      const limite = Math.ceil(0.5 * ((Math.pow(1 + i, n) - 1) / i)) + n
      expect(Math.abs(Number(dif)), `${taxa} ${n}x`).toBeLessThanOrEqual(limite)
    }
  })

  it('MOT-UNID-113: ACHADO A-07 — taxa e prazo altos concentram o resíduo na última parcela (documentado)', () => {
    // Não é erro de soma (fecha em centavos), mas distorce o plano: 2% a.m. em 480x sobre
    // R$ 90.000,00 → prestação R$ 1.800,13 e última R$ 4.307,84. O banco aceita juros sem teto
    // e até 480 parcelas (vendas_parcelas_check). Ver docs/qa-norteia-loteamento/07.
    const t = doMotor('price', 9_000_000, '0.02', 480)
    expect(t[0]!.prestacao).toBe(180_013n)
    expect(t[479]!.prestacao).toBe(430_784n)
    // A 5% a.m. e 480x a amortização mensal teórica é < 1 centavo: todo o principal vai para a última.
    const alta = doMotor('price', 9_000_000, '0.05', 480)
    expect(alta[0]!.amortizacao).toBe(0n)
    expect(alta[479]!.amortizacao).toBe(9_000_000n)
  })

  it('MOT-UNID-114: recusa número de parcelas inválido e valores negativos', () => {
    expect(() => tabelaAmortizacao('price', new Decimal(100), new Decimal('0.01'), 0)).toThrow()
    expect(() => tabelaAmortizacao('price', new Decimal(100), new Decimal('0.01'), 1.5)).toThrow()
    expect(() => tabelaAmortizacao('sac', new Decimal(-1), new Decimal('0.01'), 3)).toThrow()
    expect(() => tabelaAmortizacao('sac', new Decimal(100), new Decimal('-0.01'), 3)).toThrow()
  })
})

// ───────────────────────── Encargos de mora ─────────────────────────

function oraculoEncargos(valor: number, venc: string, pag: string, multa: string, juros: string) {
  const dias = Math.max(0, oraculoDias(venc, pag))
  if (dias === 0 || valor <= 0) return { dias, multa: 0n, juros: 0n }
  const [ma, mb] = fracao(multa)
  const [ja, jb] = fracao(juros)
  return {
    dias,
    multa: meioParaPar(BigInt(valor) * ma, mb),
    juros: meioParaPar(BigInt(valor) * ja * BigInt(dias), jb * 30n),
  }
}

describe('MOT-UNID-2xx — multa e juros de mora contra o oráculo', () => {
  const regra = (m: string, j: string) => ({
    multa: new Decimal(m),
    jurosMoraMensal: new Decimal(j),
  })
  const casos: [string, string, string][] = [
    ['MOT-UNID-201: pago no vencimento — sem encargos', '2026-03-10', '2026-03-10'],
    ['MOT-UNID-202: pago antes do vencimento — sem encargos', '2026-03-10', '2026-03-01'],
    ['MOT-UNID-203: 1 dia de atraso', '2026-03-10', '2026-03-11'],
    ['MOT-UNID-204: 30 dias de atraso', '2026-03-10', '2026-04-09'],
    ['MOT-UNID-205: 1 ano de atraso (ano comum)', '2026-03-10', '2027-03-10'],
    ['MOT-UNID-206: 1 ano de atraso cruzando 29/02/2028', '2027-12-31', '2028-12-31'],
    ['MOT-UNID-207: 5 anos de atraso', '2026-01-31', '2031-01-31'],
    ['MOT-UNID-208: vencimento 28/02 pago em 01/03 (ano comum: 1 dia)', '2027-02-28', '2027-03-01'],
    ['MOT-UNID-209: vencimento 28/02 pago em 01/03 (bissexto: 2 dias)', '2028-02-28', '2028-03-01'],
    ['MOT-UNID-210: virada de ano', '2026-12-31', '2027-01-02'],
  ]
  for (const [nome, venc, pag] of casos) {
    it(nome, () => {
      const valor = 89_927
      const o = oraculoEncargos(valor, venc, pag, '0.02', '0.01')
      const e = calcularEncargos(centavos(valor), venc, pag, regra('0.02', '0.01'))
      expect([e.diasAtraso, BigInt(e.multa), BigInt(e.jurosMora)]).toEqual([
        o.dias,
        o.multa,
        o.juros,
      ])
      expect(e.total).toBe(valor + e.multa + e.jurosMora)
    })
  }

  it('MOT-UNID-211: 500 combinações aleatórias de valor, datas e percentuais — motor = oráculo', () => {
    const rnd = gerador(4242)
    const percentuais = ['0', '0.01', '0.02', '0.005', '0.0333', '0.1']
    for (let k = 0; k < 500; k++) {
      const valor = 1 + Math.floor(rnd() * 10_000_000)
      const venc = oraculoSomarMeses('2024-01-15', Math.floor(rnd() * 60))
      const pag = deDiasCivis(diasCivis(...partes(venc)) + Math.floor(rnd() * 900) - 30)
      const m = percentuais[Math.floor(rnd() * percentuais.length)]!
      const j = percentuais[Math.floor(rnd() * percentuais.length)]!
      const o = oraculoEncargos(valor, venc, pag, m, j)
      const e = calcularEncargos(centavos(valor), venc, pag, regra(m, j))
      expect(
        [e.diasAtraso, BigInt(e.multa), BigInt(e.jurosMora)],
        `${valor} ${venc}→${pag} ${m}/${j}`,
      ).toEqual([o.dias, o.multa, o.juros])
    }
  })

  it('MOT-UNID-212: juros simples — dobrar os dias dobra os juros (± arredondamento)', () => {
    const r = regra('0', '0.01')
    const a = calcularEncargos(centavos(1_000_000), '2026-01-01', '2026-01-31', r).jurosMora
    const b = calcularEncargos(centavos(1_000_000), '2026-01-01', '2026-03-02', r).jurosMora
    expect(Math.abs(b - 2 * a)).toBeLessThanOrEqual(1)
  })

  it('MOT-UNID-213: percentuais negativos são recusados', () => {
    expect(() =>
      calcularEncargos(centavos(100), '2026-01-01', '2026-02-01', regra('-0.01', '0')),
    ).toThrow()
    expect(() =>
      calcularEncargos(centavos(100), '2026-01-01', '2026-02-01', regra('0', '-0.01')),
    ).toThrow()
  })
})

// ───────────────────────── Datas ─────────────────────────

describe('MOT-UNID-3xx — datas de vencimento e contagem de dias', () => {
  it('MOT-UNID-301: somarMeses = oráculo para todo dia de 2023 a 2029, de −24 a +36 meses', () => {
    for (let y = 2023; y <= 2029; y++)
      for (let m = 1; m <= 12; m++)
        for (let d = 1; d <= diasNoMes(y, m); d++)
          for (const k of [-24, -1, 0, 1, 2, 11, 12, 13, 36]) {
            const data = iso(y, m, d)
            expect(somarMeses(data, k), `${data} + ${k}`).toBe(oraculoSomarMeses(data, k))
          }
  })

  it('MOT-UNID-302: vencimento dia 31 cai no último dia dos meses curtos e volta a 31 depois', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(somarMeses('2026-01-31', 2)).toBe('2026-03-31')
    expect(somarMeses('2026-01-31', 3)).toBe('2026-04-30')
  })

  it('MOT-UNID-303: diasEntre = oráculo civil em 3.000 pares aleatórios (1900–2100)', () => {
    const rnd = gerador(31)
    for (let k = 0; k < 3000; k++) {
      const a = oraculoSomarMeses('1900-01-01', Math.floor(rnd() * 2400))
      const b = oraculoSomarMeses('1900-03-31', Math.floor(rnd() * 2400))
      expect(diasEntre(a, b), `${a} → ${b}`).toBe(oraculoDias(a, b))
    }
  })

  it('MOT-UNID-304: ano 2100 não é bissexto e 2000 é', () => {
    expect(diasEntre('2100-02-28', '2100-03-01')).toBe(1)
    expect(diasEntre('2000-02-28', '2000-03-01')).toBe(2)
  })

  it('MOT-UNID-305: datas inválidas são recusadas', () => {
    expect(() => diasEntre('2026-1-1', '2026-01-02')).toThrow()
    expect(() => somarMeses('01/02/2026', 1)).toThrow()
    expect(() => somarMeses('2026-01-01', 1.5)).toThrow()
  })
})

// ───────────────────────── Antecipação ─────────────────────────

describe('MOT-UNID-4xx — desconto por antecipação (RN-K08)', () => {
  it('MOT-UNID-401: parcela vencida ou no dia não tem desconto; juros zero não tem desconto', () => {
    const j = new Decimal('0.01')
    expect(descontoAntecipacao(centavos(100_000), '2026-03-10', '2026-03-10', j)).toBe(0)
    expect(descontoAntecipacao(centavos(100_000), '2026-03-10', '2026-03-20', j)).toBe(0)
    expect(descontoAntecipacao(centavos(100_000), '2026-03-10', '2026-01-10', new Decimal(0))).toBe(
      0,
    )
  })

  it('MOT-UNID-402: 30 dias antes a 1% a.m. — valor presente = saldo / 1,01 (oráculo exato)', () => {
    const d = descontoAntecipacao(
      centavos(101_000),
      '2026-04-09',
      '2026-03-10',
      new Decimal('0.01'),
    )
    expect(d).toBe(101_000 - 100_000)
  })

  it('MOT-UNID-403: desconto nunca supera o saldo e cresce com a antecedência', () => {
    const j = new Decimal('0.015')
    let anterior = -1
    for (const meses of [1, 6, 12, 60, 240]) {
      const d = descontoAntecipacao(
        centavos(500_000),
        somarMeses('2026-01-01', meses),
        '2026-01-01',
        j,
      )
      expect(d).toBeGreaterThan(anterior)
      expect(d).toBeLessThan(500_000)
      anterior = d
    }
  })
})

// ───────────────────────── Contrato ─────────────────────────

describe('MOT-UNID-5xx — plano do contrato (RN-K01, RN-K02)', () => {
  const base = {
    precoCentavos: centavos(9_000_000),
    entradaCentavos: centavos(900_000),
    dataEntrada: '2026-01-31',
    parcelas: 120,
    jurosMensal: new Decimal('0.005'),
    sistema: 'price' as const,
    primeiraParcelaEm: '2026-02-28',
  }

  it('MOT-UNID-501: entrada + amortizações = preço exato e parcela 0 é a entrada (INV-001)', () => {
    const p = gerarParcelasContrato(base)
    expect(p[0]).toMatchObject({ numero: 0, valor: 900_000, juros: 0, vencimento: '2026-01-31' })
    expect(p.reduce((s, x) => s + x.amortizacao, 0)).toBe(9_000_000)
    expect(p.every((x) => x.valor === x.amortizacao + x.juros)).toBe(true)
  })

  it('MOT-UNID-502: vencimentos mensais a partir da primeira parcela, sem pular mês', () => {
    const p = gerarParcelasContrato(base)
    expect(p[1]!.vencimento).toBe('2026-02-28')
    expect(p[2]!.vencimento).toBe('2026-03-28') // dia 28 mantido: o dia-base é o da 1ª parcela
    expect(p[120]!.vencimento).toBe('2036-01-28')
  })

  it('MOT-UNID-503: sem entrada não há parcela 0', () => {
    const p = gerarParcelasContrato({ ...base, entradaCentavos: centavos(0) })
    expect(p[0]!.numero).toBe(1)
    expect(p).toHaveLength(120)
  })

  it('MOT-UNID-504: à vista — só a entrada; entrada > preço é recusada', () => {
    expect(
      gerarParcelasContrato({ ...base, entradaCentavos: centavos(9_000_000), parcelas: 0 }),
    ).toHaveLength(1)
    expect(() => gerarParcelasContrato({ ...base, entradaCentavos: centavos(9_000_001) })).toThrow()
    expect(() => gerarParcelasContrato({ ...base, entradaCentavos: centavos(-1) })).toThrow()
  })

  it('MOT-UNID-505: parcelado sem data da 1ª parcela é recusado; à vista com parcelas é recusado', () => {
    expect(() => gerarParcelasContrato({ ...base, primeiraParcelaEm: null })).toThrow()
    expect(() => gerarParcelasContrato({ ...base, entradaCentavos: centavos(9_000_000) })).toThrow()
  })

  it('MOT-UNID-506: 240 parcelas SAC — plano = oráculo (parcelas 1..240)', () => {
    const p = gerarParcelasContrato({ ...base, sistema: 'sac', parcelas: 240 })
    const o = oraculoTabela('sac', 8_100_000n, '0.005', 240)
    expect(
      p.slice(1).map((x) => [BigInt(x.valor), BigInt(x.amortizacao), BigInt(x.juros)]),
    ).toEqual(o.map((x) => [x.prestacao, x.amortizacao, x.juros]))
  })
})
