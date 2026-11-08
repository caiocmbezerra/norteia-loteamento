import type { ClienteBanco } from '@norteia/db'
import { type ApuracaoRepasse, type PermutaFinanceira, apurarRepasses } from '@norteia/projecao'
import { vendasDoEmpreendimento } from './comercial'
import { ErroAplicacao, traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export interface DadosPermutante {
  nome: string
  documento: string | null
  email: string | null
  telefone: string | null
}

export interface PermutaDetalhe {
  id: string
  tipo: 'fisica' | 'financeira'
  permutante: string
  inicio: string
  situacao: string
  percentual: string | null
  base: 'recebido' | 'principal' | 'vgv' | null
  abateDistrato: boolean | null
  valorEconomicoCentavos: number | null
  lotes: string[]
  repasses: {
    id: string
    data: string
    valorCentavos: number
    observacao: string | null
    estornado: boolean
  }[]
  /** Extrato até hoje (financeira). */
  apuracao: ApuracaoRepasse | null
}

const SELECAO =
  'id, tipo, inicio, situacao, percentual, base, abate_distrato, valor_economico_centavos, permutantes(nome), permuta_lotes(lotes(numero, quadras(codigo))), repasses_permuta(id, data, valor_centavos, observacao, estornado_em)'

function paraFinanceira(p: {
  id: string
  percentual: number | null
  base: string | null
  abate_distrato: boolean | null
  inicio: string
  repasses_permuta: { data: string; valor_centavos: number; estornado_em: string | null }[]
}): PermutaFinanceira {
  return {
    id: p.id,
    percentual: String(p.percentual),
    base: p.base as PermutaFinanceira['base'],
    abateDistrato: !!p.abate_distrato,
    inicio: p.inicio,
    pagos: p.repasses_permuta
      .filter((r) => !r.estornado_em)
      .map((r) => ({ data: r.data, valorCentavos: r.valor_centavos })),
  }
}

/** Permutas financeiras vigentes do empreendimento, no formato da projeção (RN-T03). */
export async function permutasFinanceiras(
  db: ClienteBanco,
  empreendimentoId: string,
): Promise<PermutaFinanceira[]> {
  const { data, error } = await db
    .from('permutas')
    .select(
      'id, percentual, base, abate_distrato, inicio, repasses_permuta(data, valor_centavos, estornado_em)',
    )
    .eq('empreendimento_id', empreendimentoId)
    .eq('tipo', 'financeira')
    .eq('situacao', 'vigente')
  falhar(error)
  return (data ?? []).map(paraFinanceira)
}

export async function carregarPermutas(
  db: ClienteBanco,
  empreendimentoId: string,
  hoje: string,
): Promise<PermutaDetalhe[]> {
  const { data, error } = await db
    .from('permutas')
    .select(SELECAO)
    .eq('empreendimento_id', empreendimentoId)
    .order('criado_em')
  falhar(error)
  const lista = data ?? []
  const vendas = lista.some((p) => p.tipo === 'financeira')
    ? await vendasDoEmpreendimento(db, empreendimentoId)
    : []
  return lista.map((p) => ({
    id: p.id,
    tipo: p.tipo as PermutaDetalhe['tipo'],
    permutante: p.permutantes?.nome ?? '',
    inicio: p.inicio,
    situacao: p.situacao,
    percentual: p.percentual === null ? null : String(p.percentual),
    base: p.base as PermutaDetalhe['base'],
    abateDistrato: p.abate_distrato,
    valorEconomicoCentavos: p.valor_economico_centavos,
    lotes: p.permuta_lotes
      .map((l) => `Quadra ${l.lotes?.quadras?.codigo ?? '?'} · Lote ${l.lotes?.numero ?? '?'}`)
      .sort(),
    repasses: [...p.repasses_permuta]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((r) => ({
        id: r.id,
        data: r.data,
        valorCentavos: r.valor_centavos,
        observacao: r.observacao,
        estornado: r.estornado_em !== null,
      })),
    apuracao: p.tipo === 'financeira' ? apurarRepasses(paraFinanceira(p), vendas, hoje) : null,
  }))
}

export async function criarPermuta(
  db: ClienteBanco,
  tenantId: string,
  empreendimentoId: string,
  permutante: DadosPermutante,
  dados:
    | { tipo: 'fisica'; inicio: string; lotes: string[]; valorEconomicoCentavos: number | null }
    | {
        tipo: 'financeira'
        inicio: string
        percentual: string
        base: 'recebido' | 'principal' | 'vgv'
        abateDistrato: boolean
      },
): Promise<string> {
  let permutanteId: string | null = null
  if (permutante.documento) {
    const { data, error } = await db
      .from('permutantes')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('documento', permutante.documento)
      .maybeSingle()
    falhar(error)
    permutanteId = data?.id ?? null
  }
  if (!permutanteId) {
    const { data, error } = await db
      .from('permutantes')
      .insert({ tenant_id: tenantId, ...permutante })
      .select('id')
      .single()
    if (error?.code === '23514')
      throw new ErroAplicacao('CPF/CNPJ: informe 11 ou 14 dígitos.', 'documento', 'documento')
    falhar(error)
    permutanteId = data!.id
  }
  const { data, error } = await db.rpc('criar_permuta', {
    p_empreendimento: empreendimentoId,
    p_permutante: permutanteId,
    p_dados:
      dados.tipo === 'fisica'
        ? {
            tipo: 'fisica',
            inicio: dados.inicio,
            valor_economico_centavos: dados.valorEconomicoCentavos,
          }
        : {
            tipo: 'financeira',
            inicio: dados.inicio,
            percentual: dados.percentual,
            base: dados.base,
            abate_distrato: dados.abateDistrato,
          },
    ...(dados.tipo === 'fisica' ? { p_lotes: dados.lotes } : {}),
  })
  falhar(error)
  return data!
}

export async function registrarRepasse(
  db: ClienteBanco,
  permutaId: string,
  d: { data: string; valorCentavos: number; observacao: string | null },
): Promise<string> {
  const { data, error } = await db.rpc('registrar_repasse', {
    p_permuta: permutaId,
    p_data: d.data,
    p_valor: d.valorCentavos,
    ...(d.observacao ? { p_observacao: d.observacao } : {}),
  })
  falhar(error)
  return data!
}

export async function estornarRepasse(db: ClienteBanco, repasseId: string, motivo: string) {
  const { error } = await db.rpc('estornar_repasse', { p_repasse: repasseId, p_motivo: motivo })
  falhar(error)
}
