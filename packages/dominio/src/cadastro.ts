import { z } from 'zod'
import { LIMITES_GRADE } from './grade'
import { lerMoeda } from './formato'

/** Unidades federativas do Brasil. */
export const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const

export type Uf = (typeof UFS)[number]

export const STATUS_LOTE_CADASTRO = ['disponivel', 'bloqueado', 'permuta'] as const

export const ROTULO_STATUS_LOTE = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  vendido: 'Vendido',
  bloqueado: 'Bloqueado',
  permuta: 'Permuta',
} as const

export type StatusLote = keyof typeof ROTULO_STATUS_LOTE

/** Situação mostrada no mapa: além do status do lote, "quitado" (vendido com contrato quitado). */
export const ROTULO_SITUACAO_MAPA = { ...ROTULO_STATUS_LOTE, quitado: 'Quitado' } as const
export type SituacaoMapa = keyof typeof ROTULO_SITUACAO_MAPA
export const SITUACOES_MAPA = Object.keys(ROTULO_SITUACAO_MAPA) as SituacaoMapa[]

/** A quitação vem do contrato; o lote continua "vendido" no cadastro. */
export function situacaoNoMapa(status: StatusLote, contratoQuitado: boolean): SituacaoMapa {
  return status === 'vendido' && contratoQuitado ? 'quitado' : status
}

export const ROTULO_SITUACAO_EMPREENDIMENTO = {
  estudo: 'Em estudo',
  aprovacao: 'Em aprovação',
  registrado: 'Registrado',
  em_vendas: 'Em vendas',
  encerrado: 'Encerrado',
} as const

export const ROTULO_PAPEL = {
  dono: 'Dono',
  financeiro: 'Financeiro',
  engenharia: 'Engenharia',
  comercial_gestor: 'Gestor comercial',
  corretor: 'Corretor',
  contador: 'Contador',
  socio_leitura: 'Sócio (somente leitura)',
  permutante_leitura: 'Permutante (somente leitura)',
} as const

export type Papel = keyof typeof ROTULO_PAPEL

const texto = (rotulo: string, min = 2, max = 120) =>
  z
    .string()
    .trim()
    .min(min, `${rotulo}: informe ao menos ${min} caracteres.`)
    .max(max, `${rotulo}: no máximo ${max} caracteres.`)

const inteiro = (rotulo: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${rotulo}: informe um número.` })
    .int(`${rotulo}: informe um número inteiro.`)
    .min(min, `${rotulo}: mínimo ${min}.`)
    .max(max, `${rotulo}: máximo ${max}.`)

/** Área digitada no padrão brasileiro ("300" ou "312,50") → "312.50". */
export const areaBrasileira = z
  .string()
  .trim()
  .regex(/^\d{1,9}(,\d{1,2})?$/, 'Área: use números com até duas casas decimais (ex.: 312,50).')
  .transform((v) => v.replace(',', '.'))
  .refine((v) => Number(v) > 0, 'Área: deve ser maior que zero.')

/** Valor digitado no padrão brasileiro → centavos. Vazio vira nulo. */
export const moedaOpcional = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === '') return null
    try {
      const c = lerMoeda(v)
      if (c < 0) throw new Error()
      return c
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Preço: use o formato 90.000,00.' })
      return z.NEVER
    }
  })

/** Competência "AAAA-MM" → data do dia 1 ("AAAA-MM-01"), o mês 0 do fluxo (RN-F04). */
export const mesBase = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês de início: use o formato AAAA-MM.')
  .transform((v) => `${v}-01`)

export const esquemaNovoEmpreendimento = z
  .object({
    nomeEmpreendimento: texto('Nome do empreendimento'),
    municipio: texto('Município', 2, 80),
    uf: z.enum(UFS, { error: 'UF: escolha um estado.' }),
    mesBase,
    quadras: inteiro('Quadras', 1, LIMITES_GRADE.quadras),
    lotesPorQuadra: inteiro('Lotes por quadra', 1, LIMITES_GRADE.lotesPorQuadra),
    areaPadrao: areaBrasileira,
    precoPadrao: moedaOpcional,
  })
  .refine((d) => d.quadras * d.lotesPorQuadra <= LIMITES_GRADE.totalLotes, {
    message: `A grade automática gera no máximo ${LIMITES_GRADE.totalLotes} lotes.`,
    path: ['lotesPorQuadra'],
  })

export type NovoEmpreendimento = z.output<typeof esquemaNovoEmpreendimento>

export const esquemaCadastroInicial = esquemaNovoEmpreendimento.and(
  z.object({ nomeLoteadora: texto('Nome da loteadora') }),
)

export type CadastroInicial = z.output<typeof esquemaCadastroInicial>

/** Mensagens de erro por campo, prontas para o formulário. */
export function errosPorCampo(erro: z.ZodError): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const issue of erro.issues) {
    const campo = String(issue.path[0] ?? '_')
    saida[campo] ??= issue.message
  }
  return saida
}
