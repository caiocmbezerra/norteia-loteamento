import type { ClienteBanco } from '@norteia/db'
import { Decimal } from '@norteia/motor-financeiro'
import { ErroAplicacao, traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }

function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export type EscopoParametro = 'tenant' | 'empresa' | 'spe' | 'empreendimento'

export interface ValorParametro {
  escopo: EscopoParametro | 'plataforma'
  escopoId: string | null
  /** Nome legível do escopo (empresa, SPE ou empreendimento). */
  escopoNome: string
  valor: string
  inicio: string
  fim: string | null
  motivo: string | null
}

export interface Parametro {
  chave: string
  descricao: string
  tipo: 'decimal' | 'inteiro' | 'centavos' | 'texto' | 'booleano'
  unidade: string | null
  valoresPermitidos: string[] | null
  /** Pendência do roteiro de configuração (advogado/contador), quando houver. */
  pendencia: string | null
  /** Valor da loteadora inteira em vigor hoje. */
  vigente: ValorParametro | null
  /** Sugestão da plataforma, usada enquanto a loteadora não define. */
  sugestao: ValorParametro | null
  /** Valores específicos (empresa, SPE, empreendimento) e vigências futuras. */
  outros: ValorParametro[]
}

/** Percentuais são guardados como fração (0,02) e mostrados como % (2). */
export function ehPercentual(p: Pick<Parametro, 'tipo' | 'unidade'>) {
  return p.tipo === 'decimal' && (p.unidade ?? '').startsWith('fração')
}

function limites(vigencia: string): { inicio: string; fim: string | null } {
  const m = /^[[(]([^,]*),([^\])]*)[\])]$/.exec(vigencia)
  return { inicio: m?.[1] ?? '', fim: m?.[2] ? m[2] : null }
}

export async function carregarParametros(
  db: ClienteBanco,
  tenantId: string,
  hoje: string,
): Promise<Parametro[]> {
  const [catalogo, valores, empresas, spes, emps] = await Promise.all([
    db
      .from('parametros')
      .select('chave, descricao, tipo, unidade, valores_permitidos, pendencia_legal')
      .order('chave'),
    db
      .from('parametro_valores')
      .select('chave, escopo, escopo_id, valor, vigencia, motivo, tenant_id')
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`),
    db.from('empresas').select('id, razao_social').eq('tenant_id', tenantId),
    db.from('spes').select('id, razao_social').eq('tenant_id', tenantId),
    db.from('empreendimentos').select('id, nome').eq('tenant_id', tenantId),
  ])
  for (const r of [catalogo, valores, empresas, spes, emps]) falhar(r.error)
  const nomes = new Map<string, string>([
    ...(empresas.data ?? []).map((e) => [e.id, `Empresa ${e.razao_social}`] as [string, string]),
    ...(spes.data ?? []).map((s) => [s.id, `SPE ${s.razao_social}`] as [string, string]),
    ...(emps.data ?? []).map((e) => [e.id, `Empreendimento ${e.nome}`] as [string, string]),
  ])
  const lista = (valores.data ?? []).map((v) => {
    const { inicio, fim } = limites(String(v.vigencia))
    return {
      chave: v.chave,
      item: {
        escopo: v.escopo as ValorParametro['escopo'],
        escopoId: v.escopo_id,
        escopoNome:
          v.escopo === 'plataforma'
            ? 'Sugestão da plataforma'
            : v.escopo === 'tenant'
              ? 'Toda a loteadora'
              : (nomes.get(v.escopo_id ?? '') ?? v.escopo),
        valor: typeof v.valor === 'string' ? v.valor : JSON.stringify(v.valor),
        inicio,
        fim,
        motivo: v.motivo,
      } satisfies ValorParametro,
    }
  })
  const valeHoje = (v: ValorParametro) => v.inicio <= hoje && (v.fim === null || hoje < v.fim)
  const encerrado = (v: ValorParametro) => v.fim !== null && v.fim <= hoje
  return (catalogo.data ?? []).map((p) => {
    const daChave = lista.filter((l) => l.chave === p.chave).map((l) => l.item)
    return {
      chave: p.chave,
      descricao: p.descricao,
      tipo: p.tipo as Parametro['tipo'],
      unidade: p.unidade,
      valoresPermitidos: p.valores_permitidos,
      pendencia: p.pendencia_legal,
      vigente: daChave.find((v) => v.escopo === 'tenant' && valeHoje(v)) ?? null,
      sugestao: daChave.find((v) => v.escopo === 'plataforma' && valeHoje(v)) ?? null,
      outros: daChave
        .filter(
          (v) =>
            v.escopo !== 'plataforma' && !encerrado(v) && !(v.escopo === 'tenant' && valeHoje(v)),
        )
        .sort(
          (a, b) => a.escopoNome.localeCompare(b.escopoNome) || a.inicio.localeCompare(b.inicio),
        ),
    }
  })
}

/** Texto digitado (pt-BR) → valor JSON do parâmetro, conforme o tipo. */
export function valorDoTexto(
  p: Pick<Parametro, 'tipo' | 'unidade' | 'valoresPermitidos'>,
  texto: string,
) {
  const t = texto.trim()
  const numero = (re: RegExp, msg: string) => {
    const limpo = t.replace(/\./g, '').replace(',', '.')
    if (!re.test(t) || Number.isNaN(Number(limpo)))
      throw new ErroAplicacao(msg, 'invalido', 'valor')
    return limpo
  }
  switch (p.tipo) {
    case 'decimal': {
      const v = numero(/^-?[\d.]+(,\d+)?$/, 'Informe um número, como 2 ou 0,5.')
      return ehPercentual(p) ? new Decimal(v).div(100).toString() : new Decimal(v).toString()
    }
    case 'inteiro':
      return Number(numero(/^-?\d+$/, 'Informe um número inteiro.'))
    case 'centavos':
      return Number(
        new Decimal(numero(/^-?[\d.]+(,\d{1,2})?$/, 'Informe um valor em reais, como 50.000,00.'))
          .times(100)
          .toFixed(0),
      )
    case 'booleano':
      if (t !== 'sim' && t !== 'nao')
        throw new ErroAplicacao('Escolha sim ou não.', 'invalido', 'valor')
      return t === 'sim'
    case 'texto':
      if (!t || (p.valoresPermitidos && !p.valoresPermitidos.includes(t)))
        throw new ErroAplicacao('Escolha uma das opções.', 'invalido', 'valor')
      return t
  }
}

/** Valor guardado → texto para exibição (pt-BR). */
export function textoDoValor(p: Pick<Parametro, 'tipo' | 'unidade'>, valor: string): string {
  const bruto = valor.replace(/^"|"$/g, '')
  switch (p.tipo) {
    case 'decimal': {
      const d = new Decimal(bruto)
      return ehPercentual(p)
        ? `${d.times(100).toString().replace('.', ',')}%${p.unidade === 'fração ao mês' ? ' ao mês' : ''}`
        : d.toString().replace('.', ',')
    }
    case 'centavos':
      return `R$ ${new Decimal(bruto).div(100).toFixed(2).replace('.', ',')}`
    case 'booleano':
      return bruto === 'true' ? 'Sim' : 'Não'
    case 'inteiro':
      return `${bruto}${p.unidade ? ` ${p.unidade}` : ''}`
    default:
      return bruto
  }
}

export async function definirParametro(
  db: ClienteBanco,
  tenantId: string,
  d: {
    chave: string
    texto: string
    inicio: string
    motivo: string
    escopo: EscopoParametro
    escopoId: string | null
  },
): Promise<void> {
  const { data: p, error } = await db
    .from('parametros')
    .select('tipo, unidade, valores_permitidos')
    .eq('chave', d.chave)
    .single()
  falhar(error)
  const valor = valorDoTexto(
    {
      tipo: p!.tipo as Parametro['tipo'],
      unidade: p!.unidade,
      valoresPermitidos: p!.valores_permitidos,
    },
    d.texto,
  )
  const { error: erro } = await db.rpc('definir_parametro', {
    p_tenant: tenantId,
    p_chave: d.chave,
    p_valor: valor,
    p_inicio: d.inicio,
    p_motivo: d.motivo,
    p_escopo: d.escopo,
    ...(d.escopoId ? { p_escopo_id: d.escopoId } : {}),
  })
  falhar(erro)
}
