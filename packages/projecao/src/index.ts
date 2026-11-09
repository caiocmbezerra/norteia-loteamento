// Projeção: traduz registros do banco em lançamentos do fluxo de caixa (RN-F01, RN-F03). Puro.
export { mesDoFluxo } from './datas'
export {
  type ContaCusto,
  type ContratoCusto,
  type CustoPorCentro,
  type EntradaCustos,
  type ItemOrcamento,
  type PagamentoCusto,
  type ProjecaoCustos,
  centroDeOrcamento,
  projetarCustos,
} from './custos'
export { orcamentoDoPlano, projetarAtual } from './atual'
export {
  type DevolucaoReal,
  type EntradaReceitas,
  type ParcelaReal,
  type RecebimentoReal,
  type VendaReal,
  projetarReceitas,
} from './vendas'
export {
  type ApuracaoRepasse,
  type LinhaRepasse,
  type PermutaFinanceira,
  apurarRepasses,
} from './permutas'
export {
  type Alerta,
  type EntradaAlertas,
  type Gravidade,
  type LimitesAlertas,
  avaliarAlertas,
} from './alertas'
