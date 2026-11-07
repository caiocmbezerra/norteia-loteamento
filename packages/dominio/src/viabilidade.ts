import {
  type CustoPremissa,
  Decimal,
  type PremissasViabilidade,
  type ResumoViabilidade,
  centavos,
} from '@norteia/motor-financeiro'
import { z } from 'zod'
import { lerMoeda } from './formato'

/**
 * Premissas de viabilidade como são guardadas no banco (jsonb): frações e taxas como texto
 * decimal (sem perda de precisão), valores monetários em centavos inteiros.
 */

const decimalTexto = z.string().regex(/^-?\d+(\.\d+)?$/, 'Número decimal inválido.')
const mes = z.number().int().min(0).max(600)

export const esquemaPremissasJson = z.object({
  versao: z.literal(1),
  base: z.enum(['real', 'nominal']),
  lotesVendaveis: z.number().int().min(0).max(10_000),
  precoLoteCentavos: z.number().int().min(0),
  vendas: z.object({ mesInicio: mes, lotesPorMes: z.number().int().min(1).max(10_000) }),
  pagamento: z.object({
    entrada: decimalTexto,
    parcelas: z.number().int().min(1).max(480),
    jurosMensal: decimalTexto,
    sistema: z.enum(['price', 'sac']),
    carenciaMeses: z.number().int().min(0).max(60),
  }),
  comissao: decimalTexto,
  inadimplencia: decimalTexto,
  inadimplenciaNaEntrada: z.boolean(),
  aliquotaSobreRecebido: decimalTexto,
  custos: z
    .array(
      z.object({
        descricao: z.string().min(1).max(120),
        centroCusto: z.string().min(1).max(60),
        tipo: z.enum(['total', 'mensal']),
        valorCentavos: z.number().int().min(0),
        mesInicio: mes,
        mesFim: mes,
      }),
    )
    .max(200),
})

export type PremissasJson = z.output<typeof esquemaPremissasJson>

export function premissasParaMotor(json: unknown): PremissasViabilidade {
  const p = esquemaPremissasJson.parse(json)
  return {
    base: p.base,
    lotesVendaveis: p.lotesVendaveis,
    precoLoteCentavos: centavos(p.precoLoteCentavos),
    vendas: { ...p.vendas },
    pagamento: {
      entrada: new Decimal(p.pagamento.entrada),
      parcelas: p.pagamento.parcelas,
      jurosMensal: new Decimal(p.pagamento.jurosMensal),
      sistema: p.pagamento.sistema,
      carenciaMeses: p.pagamento.carenciaMeses,
    },
    comissao: new Decimal(p.comissao),
    inadimplencia: new Decimal(p.inadimplencia),
    inadimplenciaNaEntrada: p.inadimplenciaNaEntrada,
    aliquotaSobreRecebido: new Decimal(p.aliquotaSobreRecebido),
    custos: p.custos.map((c) => ({ ...c, valorCentavos: centavos(c.valorCentavos) })),
  }
}

export function premissasParaJson(p: PremissasViabilidade): PremissasJson {
  return {
    versao: 1,
    base: p.base,
    lotesVendaveis: p.lotesVendaveis,
    precoLoteCentavos: p.precoLoteCentavos,
    vendas: { ...p.vendas },
    pagamento: {
      entrada: p.pagamento.entrada.toString(),
      parcelas: p.pagamento.parcelas,
      jurosMensal: p.pagamento.jurosMensal.toString(),
      sistema: p.pagamento.sistema,
      carenciaMeses: p.pagamento.carenciaMeses,
    },
    comissao: p.comissao.toString(),
    inadimplencia: p.inadimplencia.toString(),
    inadimplenciaNaEntrada: p.inadimplenciaNaEntrada,
    aliquotaSobreRecebido: p.aliquotaSobreRecebido.toString(),
    custos: p.custos.map((c: CustoPremissa) => ({ ...c, valorCentavos: Number(c.valorCentavos) })),
  }
}

/** Foto dos indicadores para o plano aprovado (RN-F16): texto decimal, centavos arredondados. */
export function resumoParaJson(r: ResumoViabilidade) {
  const c = (v: Decimal) => v.toDecimalPlaces(0).toString()
  const f = (v: Decimal | null) => (v === null ? null : v.toSignificantDigits(12).toString())
  return {
    vgvVendido: c(r.vgvVendido),
    recebido: c(r.recebido),
    receitaJuros: c(r.receitaJuros),
    custos: c(r.custos),
    tributos: c(r.tributos),
    lucroNominal: c(r.lucroNominal),
    margemSobreVgv: f(r.margemSobreVgv),
    tirMensal: f(r.tir.mensal),
    tirAnual: f(r.tir.anual),
    possivelTirMultipla: r.tir.possivelTirMultipla,
    vpl: c(r.vpl),
    exposicaoMaxima: { valor: c(r.exposicaoMaxima.valor), mes: r.exposicaoMaxima.mes },
    paybackSimples: r.paybackSimples,
    paybackDescontado: r.paybackDescontado,
    fluxoMensal: r.fluxoMensal.map(c),
  }
}

export type ResumoJson = ReturnType<typeof resumoParaJson>

// ---------------------------------------------------------------------------
// Formulário (valores digitados no padrão brasileiro)
// ---------------------------------------------------------------------------

/** "10" ou "0,5" (percentual) → fração em texto ("0.1", "0.005"). */
const percentual = (rotulo: string, max = 100) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,3}(,\d{1,6})?$/, `${rotulo}: use um percentual como 10 ou 0,5.`)
    .transform((v) => new Decimal(v.replace(',', '.')))
    .refine((v) => v.lte(max), `${rotulo}: no máximo ${max}%.`)
    .transform((v) => v.div(100).toString())

const inteiro = (rotulo: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${rotulo}: informe um número.` })
    .int(`${rotulo}: informe um número inteiro.`)
    .min(min, `${rotulo}: mínimo ${min}.`)
    .max(max, `${rotulo}: máximo ${max}.`)

const dinheiro = (rotulo: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      try {
        const c = lerMoeda(v)
        if (c < 0) throw new Error()
        return Number(c)
      } catch {
        ctx.addIssue({ code: 'custom', message: `${rotulo}: use o formato 90.000,00.` })
        return z.NEVER
      }
    })

export const esquemaCustoFormulario = z
  .object({
    descricao: z.string().trim().min(1, 'Custo: informe a descrição.').max(120),
    centroCusto: z.string().trim().min(1, 'Custo: informe o centro de custo.').max(60),
    tipo: z.enum(['total', 'mensal']),
    valor: dinheiro('Valor do custo'),
    mesInicio: inteiro('Mês inicial do custo', 0, 600),
    mesFim: inteiro('Mês final do custo', 0, 600),
  })
  .refine((c) => c.mesFim >= c.mesInicio, {
    message: 'Custo: o mês final deve ser ≥ ao inicial.',
    path: ['mesFim'],
  })

export const esquemaFormularioViabilidade = z.object({
  nome: z.string().trim().min(2, 'Nome do estudo: informe ao menos 2 caracteres.').max(120),
  lotesVendaveis: inteiro('Lotes à venda', 0, 10_000),
  precoLote: dinheiro('Preço do lote'),
  vendasMesInicio: inteiro('Mês de início das vendas', 0, 600),
  lotesPorMes: inteiro('Lotes vendidos por mês', 1, 10_000),
  entrada: percentual('Entrada'),
  parcelas: inteiro('Parcelas', 1, 480),
  jurosMensal: percentual('Juros ao mês', 10),
  sistema: z.enum(['price', 'sac']),
  carenciaMeses: inteiro('Meses até a 1ª parcela', 0, 60),
  comissao: percentual('Comissão'),
  inadimplencia: percentual('Inadimplência'),
  aliquota: percentual('Tributos sobre o recebido'),
  tmaMensal: percentual('TMA ao mês', 10),
  custos: z.array(esquemaCustoFormulario).max(200),
})

export type FormularioViabilidade = z.output<typeof esquemaFormularioViabilidade>

export function formularioParaPremissas(f: FormularioViabilidade): {
  premissas: PremissasJson
  tmaMensal: string
} {
  return {
    tmaMensal: f.tmaMensal,
    premissas: {
      versao: 1,
      base: 'real',
      lotesVendaveis: f.lotesVendaveis,
      precoLoteCentavos: f.precoLote,
      vendas: { mesInicio: f.vendasMesInicio, lotesPorMes: f.lotesPorMes },
      pagamento: {
        entrada: f.entrada,
        parcelas: f.parcelas,
        jurosMensal: f.jurosMensal,
        sistema: f.sistema,
        carenciaMeses: f.carenciaMeses,
      },
      comissao: f.comissao,
      inadimplencia: f.inadimplencia,
      inadimplenciaNaEntrada: false,
      aliquotaSobreRecebido: f.aliquota,
      custos: f.custos.map((c) => ({
        descricao: c.descricao,
        centroCusto: c.centroCusto,
        tipo: c.tipo,
        valorCentavos: c.valor,
        mesInicio: c.mesInicio,
        mesFim: c.mesFim,
      })),
    },
  }
}

/**
 * Lê o FormData "achatado" (custos.0.descricao, custos.0.valor…) em um objeto aninhado
 * para o esquema do formulário. Linhas de custo totalmente vazias são ignoradas.
 */
export function lerFormularioViabilidade(valores: Record<string, string>) {
  const custos: Record<string, Record<string, string>> = {}
  const raiz: Record<string, unknown> = {}
  for (const [chave, valor] of Object.entries(valores)) {
    const m = /^custos\.(\d+)\.(\w+)$/.exec(chave)
    if (m) (custos[m[1]!] ??= {})[m[2]!] = valor
    else raiz[chave] = valor
  }
  raiz.custos = Object.keys(custos)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => custos[k]!)
    .filter((c) => ['descricao', 'valor'].some((campo) => (c[campo] ?? '').trim() !== ''))
  return raiz
}

/** Rótulo dos centros de custo padrão de loteamento (editável na Fase 3). */
export const CENTROS_CUSTO_PADRAO: Record<string, string> = {
  terreno: 'Terreno',
  aprovacao: 'Aprovação e registro',
  infraestrutura: 'Infraestrutura',
  'comercial.marketing': 'Marketing e stand',
  administracao: 'Administração',
  outros: 'Outros',
}
