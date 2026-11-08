// Gera os modelos padrão de documentos (DOCX) usados enquanto o cliente não envia os seus.
// Texto-modelo provisório: cada loteadora revisa com o seu advogado (D-059).
// Uso: node scripts/gerar-modelos-padrao.mjs → packages/integracoes/src/modelos-padrao.gerado.ts
import { writeFileSync } from 'node:fs'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

const p = (texto, opcoes = {}) =>
  new Paragraph({ spacing: { after: 160 }, ...opcoes, children: [new TextRun(texto)] })
const titulo = (texto) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: texto, bold: true })],
  })
const aviso = p(
  'MODELO PROVISÓRIO — revise este texto com o advogado da sua empresa antes de usar.',
  { alignment: AlignmentType.CENTER },
)
const assinaturas = [
  p('{cidade}, {hoje}.', { spacing: { before: 400, after: 600 } }),
  p('_____________________________________', {
    alignment: AlignmentType.CENTER,
    spacing: { after: 0 },
  }),
  p('{vendedora_razao_social}', { alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
  p('_____________________________________', {
    alignment: AlignmentType.CENTER,
    spacing: { after: 0 },
  }),
  p('{comprador_nome}', { alignment: AlignmentType.CENTER }),
]
const celula = (texto) => new TableCell({ children: [new Paragraph(texto)] })
const tabelaParcelas = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      tableHeader: true,
      children: [celula('Parcela'), celula('Vencimento'), celula('Valor')],
    }),
    new TableRow({
      children: [
        celula('{#parcelas}{numero}'),
        celula('{vencimento}'),
        celula('{valor}{/parcelas}'),
      ],
    }),
  ],
})

const tabelaPagamentos = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      tableHeader: true,
      children: [celula('Data'), celula('Referência'), celula('Valor pago')],
    }),
    new TableRow({
      children: [
        celula('{#pagamentos}{data}'),
        celula('{referencia}'),
        celula('{valor}{/pagamentos}'),
      ],
    }),
  ],
})

const modelos = {
  contrato: [
    titulo('Compromisso de compra e venda de lote'),
    aviso,
    p('VENDEDORA: {vendedora_razao_social}, CNPJ {vendedora_cnpj}.'),
    p(
      'COMPRADOR(A): {comprador_nome}, CPF {comprador_cpf}, e-mail {comprador_email}, telefone {comprador_telefone}.',
    ),
    p(
      'IMÓVEL: Lote {lote_numero} da Quadra {lote_quadra}, com {lote_area} m², do empreendimento {empreendimento_nome}, em {cidade}.',
    ),
    p(
      'PREÇO: {venda_preco}, pago com entrada de {venda_entrada} e {venda_parcelas} parcelas mensais pelo sistema {venda_sistema}, com juros de {venda_juros} ao mês, conforme a tabela abaixo.',
    ),
    tabelaParcelas,
    p(
      'REAJUSTE: as parcelas serão reajustadas pelo índice {contrato_indice}, {contrato_reajuste}.',
      { spacing: { before: 240, after: 160 } },
    ),
    p(
      'ATRASO: a parcela paga em atraso terá multa de {contrato_multa} e juros de mora de {contrato_juros_mora} ao mês, proporcionais aos dias.',
    ),
    ...assinaturas,
  ],
  quitacao: [
    titulo('Termo de quitação'),
    aviso,
    p(
      '{vendedora_razao_social}, CNPJ {vendedora_cnpj}, declara que {comprador_nome}, CPF {comprador_cpf}, pagou integralmente o preço do compromisso de compra e venda do Lote {lote_numero} da Quadra {lote_quadra} do empreendimento {empreendimento_nome}, firmado em {venda_data}.',
    ),
    p(
      'O valor total recebido foi de {quitacao_total}, com a última quitação em {quitacao_data}. A vendedora dá plena quitação das obrigações de pagamento do contrato e se compromete a outorgar a escritura definitiva, na forma do contrato.',
    ),
    ...assinaturas,
  ],
  aditivo_renegociacao: [
    titulo('Aditivo de renegociação'),
    aviso,
    p(
      'As partes do compromisso de compra e venda do Lote {lote_numero} da Quadra {lote_quadra} do empreendimento {empreendimento_nome}, firmado em {venda_data}, acordam em {aditivo_data}:',
    ),
    p(
      '1. O saldo em aberto de {aditivo_saldo_anterior}, acrescido de {aditivo_encargos} de encargos e deduzido de {aditivo_desconto} de desconto, passa a {aditivo_novo_saldo}.',
    ),
    p(
      '2. O novo saldo será pago conforme a tabela abaixo, que substitui as parcelas anteriores em aberto.',
    ),
    tabelaParcelas,
    p('3. Motivo: {aditivo_motivo}. As demais cláusulas do contrato permanecem.', {
      spacing: { before: 240, after: 160 },
    }),
    ...assinaturas,
  ],
  aditivo_cessao: [
    titulo('Aditivo de cessão de direitos'),
    aviso,
    p(
      'Em {aditivo_data}, {cedente_nome}, CPF {cedente_cpf} (CEDENTE), cede a {comprador_nome}, CPF {comprador_cpf} (CESSIONÁRIO), com a anuência de {vendedora_razao_social}, os direitos e obrigações do compromisso de compra e venda do Lote {lote_numero} da Quadra {lote_quadra} do empreendimento {empreendimento_nome}, firmado em {venda_data}.',
    ),
    p(
      'O cessionário assume o saldo em aberto de {aditivo_saldo_anterior}, nas mesmas condições do contrato. Motivo: {aditivo_motivo}.',
    ),
    ...assinaturas,
    p('_____________________________________', {
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 0 },
    }),
    p('{cedente_nome} (cedente)', { alignment: AlignmentType.CENTER }),
  ],
  aditivo_troca_lote: [
    titulo('Aditivo de troca de lote'),
    aviso,
    p(
      'Em {aditivo_data}, as partes do compromisso de compra e venda firmado em {venda_data} acordam substituir o {aditivo_lote_anterior} pelo Lote {lote_numero} da Quadra {lote_quadra} do empreendimento {empreendimento_nome}, pelo preço de {venda_preco}.',
    ),
    p(
      'O saldo em aberto de {aditivo_saldo_anterior}, ajustado pela diferença de preço, passa a {aditivo_novo_saldo}, pago conforme a tabela abaixo, que substitui as parcelas anteriores em aberto.',
    ),
    tabelaParcelas,
    p('Motivo: {aditivo_motivo}. As demais cláusulas do contrato permanecem.', {
      spacing: { before: 240, after: 160 },
    }),
    ...assinaturas,
  ],
  informe_pagamentos: [
    titulo('Informe de pagamentos — ano-calendário {informe_ano}'),
    p('MODELO PROVISÓRIO — revise este texto com o contador da sua empresa antes de usar.', {
      alignment: AlignmentType.CENTER,
    }),
    p('VENDEDORA: {vendedora_razao_social}, CNPJ {vendedora_cnpj}, {vendedora_endereco}.'),
    p('COMPRADOR(A): {comprador_nome}, CPF {comprador_cpf}.'),
    p(
      'IMÓVEL: Lote {lote_numero} da Quadra {lote_quadra}, com {lote_area} m², do empreendimento {empreendimento_nome}, em {cidade}. Compromisso de compra e venda nº {contrato_numero}, firmado em {venda_data}, pelo preço de {venda_preco}.',
    ),
    p('PAGAMENTOS FEITOS EM {informe_ano}:'),
    tabelaPagamentos,
    p('Total pago em {informe_ano}: {informe_pago_ano}.', { spacing: { before: 240, after: 160 } }),
    p('Total pago até 31/12/{informe_ano}: {informe_pago_acumulado}.'),
    p(
      'Valores efetivamente recebidos, incluídos eventuais multa e juros de mora. Informe emitido em {hoje} para fins de declaração do imposto de renda.',
    ),
    p('_____________________________________', {
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 0 },
    }),
    p('{vendedora_razao_social}', { alignment: AlignmentType.CENTER }),
  ],
}

const linhas = [
  '// Gerado por scripts/gerar-modelos-padrao.mjs — não editar à mão.',
  '/** Modelos DOCX padrão (base64), usados enquanto o cliente não envia os seus. */',
  'export const MODELOS_PADRAO = {',
]
for (const [tipo, filhos] of Object.entries(modelos)) {
  const doc = new Document({
    creator: 'NorteIA Loteamento',
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{ children: filhos }],
  })
  const b64 = (await Packer.toBuffer(doc)).toString('base64')
  linhas.push(`  ${tipo}: '${b64}',`)
}
linhas.push('} as const', '')
writeFileSync('packages/integracoes/src/modelos-padrao.gerado.ts', linhas.join('\n'))
console.log('Modelos gerados:', Object.keys(modelos).join(', '))
