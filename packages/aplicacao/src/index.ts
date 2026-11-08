// Casos de uso: orquestram banco, motor e integrações. Recebem o cliente do banco por injeção.
export { ErroAplicacao, traduzirErroBanco } from './erros'
export { criarEmpreendimento, realizarCadastroInicial } from './empreendimentos'
export {
  type AnaliseViabilidade,
  type Estresse,
  analisarViabilidade,
  aprovarViabilidade,
  criarDemonstracao,
  criarViabilidade,
  estressesPadrao,
  premissasSugeridas,
  salvarViabilidade,
} from './viabilidade'
export {
  type NovaConta,
  type NovoContrato,
  type PainelCustos,
  carregarPainelCustos,
  criarOrcamentoDoPlano,
  estornarPagamento,
  registrarConta,
  registrarContrato,
  registrarPagamento,
} from './custos'
export {
  type DadosVenda,
  cancelarReserva,
  registrarVenda,
  reservarLote,
  vendasDoEmpreendimento,
} from './comercial'
