// Motor financeiro puro (docs/arquitetura.md §5). Sem acesso a banco, rede ou relógio.
export { type Arredondamento, Decimal, type ValorDecimal } from './decimal'
export {
  type Centavos,
  ErroDinheiro,
  ZERO,
  arredondarCentavos,
  centavos,
  deReais,
  emReais,
  negar,
  somar,
  subtrair,
} from './dinheiro'
export {
  type BaseMonetaria,
  CATEGORIAS_DE_RECEITA,
  CATEGORIAS_DO_PROJETO,
  type Categoria,
  ErroMotor,
  type FluxoMensal,
  type Lancamento,
  type Natureza,
  agregarPorMes,
  totalPorCategoria,
} from './fluxo'
export { type Taxa, anualParaMensal, mensalParaAnual } from './taxa'
export {
  type OpcoesAmortizacao,
  type Parcela,
  type SistemaAmortizacao,
  tabelaAmortizacao,
} from './amortizacao'
export {
  type FluxoComData,
  type ResultadoTir,
  acumulado,
  exposicaoMaxima,
  necessidadeDeAporte,
  paybackDescontado,
  paybackSimples,
  tir,
  trocasDeSinal,
  vpl,
  xirr,
} from './indicadores'
export {
  type CustoPremissa,
  type PremissasViabilidade,
  type ProjecaoViabilidade,
  type ResumoViabilidade,
  projetarViabilidade,
  resumirViabilidade,
} from './viabilidade'
export { type Choque, aplicarChoques, estressar, matrizSensibilidade } from './estresse'
export { CASO_REFERENCIA, TMA_REFERENCIA } from './caso-referencia'
