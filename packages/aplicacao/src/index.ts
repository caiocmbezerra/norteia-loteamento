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
  type CriterioRateio,
  type NovaConta,
  type NovoContrato,
  type PainelCustos,
  LIMITE_ANEXO,
  anexarDocumentoConta,
  carregarPainelCustos,
  criarOrcamentoDoPlano,
  ratearDespesa,
  estornarPagamento,
  registrarConta,
  registrarContrato,
  registrarMedicao,
  registrarPagamento,
} from './custos'
export {
  type CondicoesPreco,
  type DadosComprador,
  type DadosProposta,
  cancelarProposta,
  criarProposta,
  decidirProposta,
  condicoesDePreco,
  type DadosVenda,
  obterComprador,
  cancelarReserva,
  decidirAprovacaoDesconto,
  publicarTabelaPreco,
  registrarVenda,
  solicitarAprovacaoDesconto,
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
export {
  MARCADORES,
  type ModeloCliente,
  NOMES_DOCUMENTO,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
  carregarModelos,
  enviarModelo,
  gerarDocumento,
  gerarDocumentoPortal,
  gerarInforme,
  modeloEmUso,
  usarModeloPadrao,
} from './documentos'
export {
  type EntradaSimulacaoDistrato,
  type SimulacaoDistrato,
  executarDistrato,
  pagarDevolucao,
  regrasDistrato,
  simularDistrato,
} from './distrato'
export {
  type DadosPermutante,
  type PermutaDetalhe,
  carregarPermutas,
  criarPermuta,
  estornarRepasse,
  permutasFinanceiras,
  registrarRepasse,
} from './permutas'
export {
  type PainelSpe,
  type SocioNaSpe,
  TIPOS_MOVIMENTO,
  type TipoMovimento,
  cadastrarSocio,
  carregarPainelSpe,
  definirParticipacao,
  estornarMovimentoSocio,
  registrarMovimentoSocio,
} from './socios'
export {
  type LinhaConsolidado,
  type PainelConsolidado,
  carregarConsolidado,
  simularCessao,
} from './paineis'
export {
  type ContratoPortal,
  type MeuPortal,
  aceitarConvitePortal,
  andamentoObra,
  carregarContratoPortal,
  carregarMeuPortal,
  convidarParaPortal,
  emitirSegundaVia,
  extratoPermutante,
  temPortal,
} from './portal'
export * from './fiscal'
export * from './contabil'
export * from './importacao'
export * from './assistente'
export * from './alertas'
export * from './leitura'
export * from './implantacao'
