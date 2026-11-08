import {
  type PremissasViabilidade,
  type ProjecaoViabilidade,
  projetarViabilidade,
} from '@norteia/motor-financeiro'
import type { ItemOrcamento, ProjecaoCustos } from './custos'
import type { PermutaFinanceira } from './permutas'
import { type VendaReal, projetarReceitas } from './vendas'

/** Orçamento inicial a partir dos custos do plano aprovado (para o orçamento revisado). */
export function orcamentoDoPlano(premissas: PremissasViabilidade): ItemOrcamento[] {
  return premissas.custos.map((c) => ({
    centro: c.centroCusto,
    tipo: c.tipo,
    valorCentavos: Number(c.valorCentavos),
    mesInicio: c.mesInicio,
    mesFim: c.mesFim,
  }))
}

/**
 * Fluxo "realizado + projetado" do empreendimento. Custos: projeção de custos, que substitui os
 * custos do estudo — nunca se somam (RN-F03). Receitas: com `vendas`, as vendas reais mais o
 * estoque restante no ritmo do plano; sem `vendas`, as premissas do plano.
 */
export function projetarAtual(
  premissas: PremissasViabilidade,
  custos: ProjecaoCustos,
  vendas?: {
    dataBase: string
    hoje: string
    vendas: readonly VendaReal[]
    permutas?: readonly PermutaFinanceira[]
  },
): ProjecaoViabilidade {
  const receitas = vendas
    ? projetarReceitas({ ...vendas, premissas })
    : projetarViabilidade({ ...premissas, custos: [] })
  return { ...receitas, lancamentos: [...receitas.lancamentos, ...custos.lancamentos] }
}
