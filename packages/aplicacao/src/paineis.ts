import type { ClienteBanco } from '@norteia/db'
import {
  Decimal,
  type SimulacaoCessaoCarteira,
  centavos,
  simularCessaoCarteira,
} from '@norteia/motor-financeiro'
import { paginar } from './carteira'
import { traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export interface LinhaConsolidado {
  id: string
  nome: string
  situacao: string
  speId: string
  spe: string
  lotes: number
  vendidos: number
  disponiveis: number
  reservados: number
  permuta: number
  estoqueCentavos: number
  vgvVendido: number
  recebido: number
  recebidoMes: number
  saldoCarteira: number
  vencido: number
  inadimplentes: number
  custosPagos: number
  aPagar: number
  aDevolver: number
  plano: {
    versao: number
    tirAnual: string | null
    vpl: string
    lucro: string
    exposicao: string
  } | null
}

export interface PainelConsolidado {
  linhas: LinhaConsolidado[]
  totais: Omit<LinhaConsolidado, 'id' | 'nome' | 'situacao' | 'speId' | 'spe' | 'plano'>
}

const CAMPOS = [
  'lotes',
  'vendidos',
  'disponiveis',
  'reservados',
  'permuta',
  'estoqueCentavos',
  'vgvVendido',
  'recebido',
  'recebidoMes',
  'saldoCarteira',
  'vencido',
  'inadimplentes',
  'custosPagos',
  'aPagar',
  'aDevolver',
] as const

/** Painel consolidado da loteadora (uma consulta agregada no banco). */
export async function carregarConsolidado(
  db: ClienteBanco,
  tenantId: string,
  hoje: string,
): Promise<PainelConsolidado> {
  const { data, error } = await db.rpc('painel_consolidado', { p_tenant: tenantId, p_hoje: hoje })
  falhar(error)
  const linhas = ((data ?? []) as Record<string, unknown>[]).map((x) => {
    const n = (k: string) => Number(x[k] ?? 0)
    const plano = x.plano as Record<string, unknown> | null
    return {
      id: String(x.id),
      nome: String(x.nome),
      situacao: String(x.situacao),
      speId: String(x.spe_id),
      spe: String(x.spe),
      lotes: n('lotes'),
      vendidos: n('vendidos'),
      disponiveis: n('disponiveis'),
      reservados: n('reservados'),
      permuta: n('permuta'),
      estoqueCentavos: n('estoque_centavos'),
      vgvVendido: n('vgv_vendido'),
      recebido: n('recebido'),
      recebidoMes: n('recebido_mes'),
      saldoCarteira: n('saldo_carteira'),
      vencido: n('vencido'),
      inadimplentes: n('inadimplentes'),
      custosPagos: n('custos_pagos'),
      aPagar: n('a_pagar'),
      aDevolver: n('a_devolver'),
      plano: plano
        ? {
            versao: Number(plano.versao),
            tirAnual: (plano.tir_anual as string | null) ?? null,
            vpl: String(plano.vpl ?? '0'),
            lucro: String(plano.lucro ?? '0'),
            exposicao: String(plano.exposicao ?? '0'),
          }
        : null,
    }
  })
  const totais = Object.fromEntries(
    CAMPOS.map((c) => [c, linhas.reduce((t, l) => t + l[c], 0)]),
  ) as PainelConsolidado['totais']
  return { linhas, totais }
}

/** Cessão de carteira: quanto valem hoje as parcelas em aberto à taxa do comprador. */
export async function simularCessao(
  db: ClienteBanco,
  empreendimentoId: string,
  hoje: string,
  taxaMensal: string,
  perdaEsperada: string,
): Promise<SimulacaoCessaoCarteira> {
  const parcelas = await paginar((de, ate) =>
    db
      .from('parcelas')
      .select(
        'vencimento, valor_centavos, pago_centavos, contratos!inner(empreendimento_id, situacao)',
      )
      .eq('contratos.empreendimento_id', empreendimentoId)
      .eq('contratos.situacao', 'vigente')
      .eq('situacao', 'aberta')
      .order('id')
      .range(de, ate),
  )
  return simularCessaoCarteira(
    parcelas.map((p) => ({
      vencimento: p.vencimento,
      saldoCentavos: centavos(p.valor_centavos - p.pago_centavos),
    })),
    hoje,
    new Decimal(taxaMensal),
    new Decimal(perdaEsperada),
  )
}
