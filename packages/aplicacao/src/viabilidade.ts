import type { ClienteBanco, Json } from '@norteia/db'
import {
  type PremissasJson,
  type ResumoJson,
  gerarGrade,
  premissasParaJson,
  premissasParaMotor,
  resumoParaJson,
} from '@norteia/dominio'
import {
  CASO_REFERENCIA,
  type Choque,
  Decimal,
  type PremissasViabilidade,
  type ResumoViabilidade,
  type Taxa,
  centavos,
  estressar,
  matrizSensibilidade,
  projetarViabilidade,
  resumirViabilidade,
} from '@norteia/motor-financeiro'
import { popularCarteiraDemonstracao } from './demonstracao'
import { ErroAplicacao, traduzirErroBanco } from './erros'

export interface Estresse {
  nome: string
  resumo: ResumoViabilidade
}

export interface AnaliseViabilidade {
  base: ResumoViabilidade
  estresses: Estresse[]
  /** TIR anual: linhas = velocidade de vendas, colunas = preço. */
  sensibilidade: {
    precos: string[]
    velocidades: number[]
    tirAnual: (Decimal | null)[][]
  }
}

/** Testes de estresse padrão, montados a partir das premissas do próprio estudo. */
export function estressesPadrao(p: PremissasViabilidade): { nome: string; choques: Choque[] }[] {
  const lista: { nome: string; choques: Choque[] }[] = [
    {
      nome: 'Vendas na metade da velocidade',
      choques: [
        {
          tipo: 'velocidade_vendas',
          lotesPorMes: Math.max(1, Math.floor(p.vendas.lotesPorMes / 2)),
        },
      ],
    },
    { nome: 'Preço 10% menor', choques: [{ tipo: 'preco', fator: new Decimal('0.9') }] },
    {
      nome: 'Inadimplência dobra',
      choques: [{ tipo: 'inadimplencia', fracao: Decimal.min(p.inadimplencia.times(2), 1) }],
    },
    { nome: 'Atraso de 6 meses nas vendas', choques: [{ tipo: 'atraso_vendas', meses: 6 }] },
  ]
  if (p.custos.some((c) => c.centroCusto === 'infraestrutura')) {
    lista.splice(2, 0, {
      nome: 'Infraestrutura 15% mais cara',
      choques: [{ tipo: 'custo', centroCusto: 'infraestrutura', fator: new Decimal('1.15') }],
    })
  }
  return lista
}

/** Tudo o que a tela de viabilidade mostra, calculado pelo motor (RN-F01). */
export function analisarViabilidade(premissasJson: unknown, tmaMensal: string): AnaliseViabilidade {
  const p = premissasParaMotor(premissasJson)
  const tma: Taxa = { base: p.base, mensal: new Decimal(tmaMensal) }
  const fatores = ['0.9', '1', '1.1']
  const velocidades = [
    ...new Set([
      Math.max(1, Math.round(p.vendas.lotesPorMes / 2)),
      p.vendas.lotesPorMes,
      Math.round(p.vendas.lotesPorMes * 1.5),
    ]),
  ]
  return {
    base: resumirViabilidade(projetarViabilidade(p), tma),
    estresses: estressesPadrao(p).map((e) => ({
      nome: e.nome,
      resumo: estressar(p, e.choques, tma),
    })),
    sensibilidade: {
      precos: fatores,
      velocidades,
      tirAnual: matrizSensibilidade(
        p,
        fatores.map((f) => ({ tipo: 'preco', fator: new Decimal(f) })),
        velocidades.map((v) => ({ tipo: 'velocidade_vendas', lotesPorMes: v })),
        tma,
      ),
    },
  }
}

export async function criarViabilidade(
  db: ClienteBanco,
  tenantId: string,
  empreendimentoId: string,
  nome: string,
  premissas: PremissasJson,
  tmaMensal: string,
): Promise<string> {
  premissasParaMotor(premissas) // valida antes de gravar
  const { data, error } = await db
    .from('viabilidades')
    .insert({
      tenant_id: tenantId,
      empreendimento_id: empreendimentoId,
      nome,
      premissas: premissas as unknown as NonNullable<Json>,
      tma_mensal: Number(tmaMensal),
    })
    .select('id')
    .single()
  if (error) throw traduzirErroBanco(error)
  return data.id
}

export async function salvarViabilidade(
  db: ClienteBanco,
  id: string,
  nome: string,
  premissas: PremissasJson,
  tmaMensal: string,
): Promise<void> {
  premissasParaMotor(premissas)
  const { data, error } = await db
    .from('viabilidades')
    .update({
      nome,
      premissas: premissas as unknown as NonNullable<Json>,
      tma_mensal: Number(tmaMensal),
    })
    .eq('id', id)
    .select('id')
  if (error) throw traduzirErroBanco(error)
  if (!data.length) {
    throw new ErroAplicacao(
      'Este estudo não pode ser alterado (já aprovado ou sem permissão).',
      'bloqueado',
    )
  }
}

/** RN-F16: congela premissas e indicadores calculados pelo motor numa nova versão do plano. */
export async function aprovarViabilidade(
  db: ClienteBanco,
  id: string,
  motivo?: string,
): Promise<number> {
  const { data: v, error } = await db
    .from('viabilidades')
    .select('premissas, tma_mensal')
    .eq('id', id)
    .single()
  if (error) throw traduzirErroBanco(error)
  const p = premissasParaMotor(v.premissas)
  const resumo: ResumoJson = resumoParaJson(
    resumirViabilidade(projetarViabilidade(p), {
      base: p.base,
      mensal: new Decimal(String(v.tma_mensal)),
    }),
  )
  const { data: versao, error: e2 } = await db.rpc('aprovar_viabilidade', {
    p_viabilidade: id,
    p_resumo: resumo as unknown as Json,
    ...(motivo ? { p_motivo: motivo } : {}),
  })
  if (e2) throw traduzirErroBanco(e2)
  return versao
}

/** Premissas iniciais de um estudo novo, a partir dos lotes do empreendimento. */
export function premissasSugeridas(
  lotes: { status: string; preco_base_centavos: number | null }[],
): PremissasJson {
  const vendaveis = lotes.filter((l) => l.status !== 'permuta')
  const precos = vendaveis.map((l) => l.preco_base_centavos).filter((v): v is number => v !== null)
  const preco = precos.length ? Math.round(precos.reduce((s, v) => s + v, 0) / precos.length) : 0
  const base = premissasParaJson(CASO_REFERENCIA)
  return {
    ...base,
    lotesVendaveis: vendaveis.length,
    precoLoteCentavos: preco,
    aliquotaSobreRecebido: '0',
    custos: base.custos.map((c) => ({ ...c, valorCentavos: 0 })),
  }
}

/**
 * Empreendimento de demonstração com o caso de referência (Fase 2): 120 lotes, 18 em
 * permuta física, estudo de viabilidade aprovado como plano original.
 */
export async function criarDemonstracao(
  db: ClienteBanco,
  tenantId: string,
  /** Com a data de hoje, a demonstração também ganha vendas, carteira e atrasos. */
  hoje?: string,
): Promise<string> {
  const { data: spe, error: e1 } = await db
    .from('spes')
    .select('id')
    .eq('tenant_id', tenantId)
    .order('criado_em')
    .limit(1)
    .single()
  if (e1) throw traduzirErroBanco(e1)

  const lotes = gerarGrade({
    quadras: 3,
    lotesPorQuadra: 40,
    areaM2: '300.00',
    precoBaseCentavos: centavos(CASO_REFERENCIA.precoLoteCentavos),
  })
  const { data: empreendimentoId, error: e2 } = await db.rpc('criar_empreendimento_com_lotes', {
    p_tenant: tenantId,
    p_spe: spe.id,
    p_nome: 'Demonstração — Caso de referência',
    p_municipio: 'Uberlândia',
    p_uf: 'MG',
    p_data_base: '2026-01-01',
    p_lotes: lotes.map((l) => ({
      quadra: l.quadra,
      numero: l.numero,
      area_m2: l.areaM2,
      preco_base_centavos: l.precoBaseCentavos,
    })),
  })
  if (e2) throw traduzirErroBanco(e2)

  // 18 lotes da quadra C ficam com o dono da terra (permuta física, RN-T01).
  const { data: quadraC, error: e3 } = await db
    .from('quadras')
    .select('id')
    .eq('empreendimento_id', empreendimentoId)
    .eq('codigo', 'C')
    .single()
  if (e3) throw traduzirErroBanco(e3)
  const permuta = Array.from({ length: 18 }, (_, i) => String(23 + i))
  const { error: e4 } = await db
    .from('lotes')
    .update({ status: 'permuta' })
    .eq('quadra_id', quadraC.id)
    .in('numero', permuta)
  if (e4) throw traduzirErroBanco(e4)

  const id = await criarViabilidade(
    db,
    tenantId,
    empreendimentoId,
    'Caso de referência (demonstração)',
    premissasParaJson(CASO_REFERENCIA),
    '0.012',
  )
  await aprovarViabilidade(db, id)
  if (hoje) await popularCarteiraDemonstracao(db, empreendimentoId, hoje)
  return empreendimentoId
}
