import type { ClienteBanco } from '@norteia/db'
import {
  CATEGORIAS_DO_PROJETO,
  Decimal,
  type Participacao,
  SEM_SOCIO,
  ratearPorSocio,
  somarMeses,
  xirr,
} from '@norteia/motor-financeiro'
import { carregarPainelCustos } from './custos'
import { traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export const TIPOS_MOVIMENTO = ['aporte', 'mutuo', 'devolucao_mutuo', 'distribuicao'] as const
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number]

export interface SocioNaSpe {
  id: string
  nome: string
  /** Participação vigente hoje (fração). */
  participacaoHoje: string | null
  aportesCentavos: number
  mutuosCentavos: number
  devolucoesMutuoCentavos: number
  distribuicoesCentavos: number
  /** Resultado da SPE rateado pela participação vigente em cada mês (RN-S01). */
  resultadoCentavos: number
  /** TIR anual sobre os movimentos realizados do sócio (nula sem troca de sinal). */
  tirAnual: string | null
}

export interface PainelSpe {
  id: string
  razaoSocial: string
  empreendimentos: { id: string; nome: string; comPlano: boolean }[]
  resultadoCentavos: number
  semSocioCentavos: number
  socios: SocioNaSpe[]
  participacoes: {
    id: string
    socio: string
    percentual: string
    inicio: string
    fim: string | null
  }[]
  movimentos: {
    id: string
    socio: string
    tipo: TipoMovimento
    data: string
    valorCentavos: number
    observacao: string | null
    estornado: boolean
  }[]
  todosSocios: { id: string; nome: string }[]
}

function limites(vigencia: string): { inicio: string; fim: string | null } {
  const m = /^[[(]([^,]*),([^\])]*)[\])]$/.exec(vigencia)
  return { inicio: m?.[1] ?? '', fim: m?.[2] ? m[2] : null }
}

const inteiro = (d: Decimal) => Number(d.toDecimalPlaces(0).toFixed(0))

/** Painel da SPE: resultado dos empreendimentos rateado entre os sócios e retorno de cada um. */
export async function carregarPainelSpe(
  db: ClienteBanco,
  speId: string,
  hoje: string,
): Promise<PainelSpe | null> {
  const { data: spe, error } = await db
    .from('spes')
    .select('id, tenant_id, razao_social, empreendimentos(id, nome, data_base)')
    .eq('id', speId)
    .maybeSingle()
  falhar(error)
  if (!spe) return null
  const [part, movs, socios] = await Promise.all([
    db.from('participacoes').select('id, socio_id, percentual, vigencia').eq('spe_id', speId),
    db
      .from('movimentos_socio')
      .select('id, socio_id, tipo, data, valor_centavos, observacao, estornado_em')
      .eq('spe_id', speId)
      .order('data'),
    db.from('socios').select('id, nome').eq('tenant_id', spe.tenant_id).order('nome'),
  ])
  for (const r of [part, movs, socios]) falhar(r.error)

  // Fluxo atual de cada empreendimento, em datas de calendário (1º dia do mês).
  const valores: { data: string; valor: Decimal }[] = []
  const empreendimentos: PainelSpe['empreendimentos'] = []
  for (const e of spe.empreendimentos) {
    const painel = await carregarPainelCustos(db, e.id, hoje)
    empreendimentos.push({ id: e.id, nome: e.nome, comPlano: painel.lancamentosAtuais !== null })
    const base = `${painel.dataBase.slice(0, 7)}-01`
    for (const l of painel.lancamentosAtuais ?? [])
      if (CATEGORIAS_DO_PROJETO.includes(l.categoria))
        valores.push({ data: somarMeses(base, l.mes), valor: l.valor })
  }
  const nomes = new Map((socios.data ?? []).map((s) => [s.id, s.nome]))
  const participacoes: Participacao[] = (part.data ?? []).map((p) => {
    const { inicio, fim } = limites(String(p.vigencia))
    return { socio: p.socio_id, percentual: new Decimal(String(p.percentual)), inicio, fim }
  })
  const rateio = ratearPorSocio(valores, participacoes)
  const ativos = (movs.data ?? []).filter((m) => !m.estornado_em)
  const ids = [...new Set([...participacoes.map((p) => p.socio), ...ativos.map((m) => m.socio_id)])]
  const soma = (socio: string, tipo: string) =>
    ativos
      .filter((m) => m.socio_id === socio && m.tipo === tipo)
      .reduce((t, m) => t + m.valor_centavos, 0)

  return {
    id: spe.id,
    razaoSocial: spe.razao_social,
    empreendimentos,
    resultadoCentavos: inteiro(valores.reduce((t, v) => t.plus(v.valor), new Decimal(0))),
    semSocioCentavos: inteiro(rateio.get(SEM_SOCIO) ?? new Decimal(0)),
    socios: ids
      .map((id) => {
        const vigente = participacoes.find(
          (p) => p.socio === id && p.inicio <= hoje && (p.fim === null || hoje < p.fim),
        )
        // Visão do sócio: aporte e mútuo saem do bolso dele; distribuição e devolução entram.
        const fluxo = ativos
          .filter((m) => m.socio_id === id)
          .map((m) => ({
            data: m.data,
            valor: new Decimal(m.valor_centavos).times(
              m.tipo === 'aporte' || m.tipo === 'mutuo' ? -1 : 1,
            ),
          }))
        const tir = xirr(fluxo)
        return {
          id,
          nome: nomes.get(id) ?? '—',
          participacaoHoje: vigente ? vigente.percentual.toString() : null,
          aportesCentavos: soma(id, 'aporte'),
          mutuosCentavos: soma(id, 'mutuo'),
          devolucoesMutuoCentavos: soma(id, 'devolucao_mutuo'),
          distribuicoesCentavos: soma(id, 'distribuicao'),
          resultadoCentavos: inteiro(rateio.get(id) ?? new Decimal(0)),
          tirAnual: tir ? tir.toString() : null,
        }
      })
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    participacoes: participacoes
      .map((p, i) => ({
        id: part.data![i]!.id,
        socio: nomes.get(p.socio) ?? '—',
        percentual: p.percentual.toString(),
        inicio: p.inicio,
        fim: p.fim,
      }))
      .sort((a, b) => b.inicio.localeCompare(a.inicio) || a.socio.localeCompare(b.socio)),
    movimentos: (movs.data ?? [])
      .map((m) => ({
        id: m.id,
        socio: nomes.get(m.socio_id) ?? '—',
        tipo: m.tipo as TipoMovimento,
        data: m.data,
        valorCentavos: m.valor_centavos,
        observacao: m.observacao,
        estornado: m.estornado_em !== null,
      }))
      .reverse(),
    todosSocios: socios.data ?? [],
  }
}

export async function cadastrarSocio(
  db: ClienteBanco,
  tenantId: string,
  d: { nome: string; documento: string | null; email: string | null },
): Promise<string> {
  const { data, error } = await db
    .from('socios')
    .insert({ tenant_id: tenantId, ...d })
    .select('id')
    .single()
  falhar(error)
  return data!.id
}

export async function definirParticipacao(
  db: ClienteBanco,
  speId: string,
  d: { socioId: string; percentual: string; inicio: string; motivo: string },
) {
  const { error } = await db.rpc('definir_participacao', {
    p_spe: speId,
    p_socio: d.socioId,
    p_percentual: Number(d.percentual),
    p_inicio: d.inicio,
    p_motivo: d.motivo,
  })
  falhar(error)
}

export async function registrarMovimentoSocio(
  db: ClienteBanco,
  speId: string,
  d: {
    socioId: string
    tipo: TipoMovimento
    data: string
    valorCentavos: number
    observacao: string | null
  },
): Promise<string> {
  const { data, error } = await db.rpc('registrar_movimento_socio', {
    p_spe: speId,
    p_socio: d.socioId,
    p_tipo: d.tipo,
    p_data: d.data,
    p_valor: d.valorCentavos,
    ...(d.observacao ? { p_observacao: d.observacao } : {}),
  })
  falhar(error)
  return data!
}

export async function estornarMovimentoSocio(
  db: ClienteBanco,
  movimentoId: string,
  motivo: string,
) {
  const { error } = await db.rpc('estornar_movimento_socio', {
    p_movimento: movimentoId,
    p_motivo: motivo,
  })
  falhar(error)
}
