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
  type DadosComprador,
  type DadosVenda,
  obterComprador,
  cancelarReserva,
  registrarVenda,
  reservarLote,
  vendasDoEmpreendimento,
} from './comercial'
export {
  type ContratoDetalhe,
  type ContratoNaCarteira,
  type DadosRecebimento,
  type DadosRenegociacao,
  type DadosTrocaLote,
  INDICES_REAJUSTE,
  type IndiceReajuste,
  type PainelCarteira,
  type ParcelaContratoDetalhe,
  type RecebimentoContrato,
  anteciparParcelas,
  carregarCarteira,
  cederContrato,
  carregarContrato,
  estornarRecebimento,
  gerarContrato,
  reajustarContrato,
  registrarRecebimento,
  renegociarContrato,
  trocarLote,
} from './carteira'
export {
  type IntegracaoAsaas,
  cancelarCobranca,
  carregarIntegracaoAsaas,
  configurarAsaas,
  desativarAsaas,
  gerarCobranca,
} from './integracoes'
export {
  type EscopoParametro,
  type Parametro,
  type ValorParametro,
  carregarParametros,
  definirParametro,
  ehPercentual,
  textoDoValor,
  valorDoTexto,
} from './parametros'
