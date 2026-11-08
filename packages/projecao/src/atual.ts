import {
  type PremissasViabilidade,
  type ProjecaoViabilidade,
  projetarViabilidade,
} from '@norteia/motor-financeiro'
import type { ItemOrcamento, ProjecaoCustos } from './custos'

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
 * Fluxo "realizado + projetado" do empreendimento: as receitas seguem as premissas do plano
 * (até o módulo comercial existir) e os custos vêm da projeção de custos, que substitui os
 * custos do estudo — nunca se somam aos dele (RN-F03).
 */
export function projetarAtual(
  premissas: PremissasViabilidade,
  custos: ProjecaoCustos,
): ProjecaoViabilidade {
  const receitas = projetarViabilidade({ ...premissas, custos: [] })
  return { ...receitas, lancamentos: [...receitas.lancamentos, ...custos.lancamentos] }
}
