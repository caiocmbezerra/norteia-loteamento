import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

/** Conteúdo do extrato já formatado (datas e valores em pt-BR); o PDF só faz o leiaute. */
export interface DadosExtratoPdf {
  titulo: string
  /** Pares rótulo → valor do cabeçalho (loteadora, comprador, contrato, lote…). */
  identificacao: [string, string][]
  /** Pares rótulo → valor do resumo (pago, saldo, em atraso, quitação hoje…). */
  resumo: [string, string][]
  parcelas: { numero: string; vencimento: string; valor: string; pago: string; situacao: string }[]
  pagamentos: { data: string; parcela: string; valor: string }[]
  rodape: string
}

const A4 = { largura: 595.28, altura: 841.89 }
const MARGEM = 48
const CINZA = rgb(0.35, 0.35, 0.35)

/** Gera o extrato do contrato em PDF (A4, fontes padrão; acentos do português suportados). */
export async function gerarExtratoPdf(d: DadosExtratoPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(d.titulo)
  pdf.setLanguage('pt-BR')
  const normal = await pdf.embedFont(StandardFonts.Helvetica)
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold)
  let pagina: PDFPage = pdf.addPage([A4.largura, A4.altura])
  let y = A4.altura - MARGEM

  const novaPagina = () => {
    pagina = pdf.addPage([A4.largura, A4.altura])
    y = A4.altura - MARGEM
  }
  const garantir = (altura: number) => {
    if (y - altura < MARGEM + 24) novaPagina()
  }
  const texto = (t: string, x: number, fonte: PDFFont, tamanho: number, cor = rgb(0, 0, 0)) =>
    pagina.drawText(t, { x, y, size: tamanho, font: fonte, color: cor })
  const direita = (t: string, xFim: number, fonte: PDFFont, tamanho: number) =>
    texto(t, xFim - fonte.widthOfTextAtSize(t, tamanho), fonte, tamanho)

  texto(d.titulo, MARGEM, negrito, 16)
  y -= 24
  for (const [rotulo, valor] of d.identificacao) {
    garantir(14)
    texto(`${rotulo}:`, MARGEM, negrito, 9)
    texto(valor, MARGEM + 110, normal, 9)
    y -= 13
  }
  y -= 8
  for (const [rotulo, valor] of d.resumo) {
    garantir(14)
    texto(rotulo, MARGEM, normal, 10)
    direita(valor, A4.largura - MARGEM, negrito, 10)
    y -= 15
  }

  const colunas = [MARGEM, MARGEM + 50, MARGEM + 150, MARGEM + 270, MARGEM + 390]
  const fim = A4.largura - MARGEM
  const cabecalhoParcelas = () => {
    texto('Parcela', colunas[0]!, negrito, 9)
    texto('Vencimento', colunas[1]!, negrito, 9)
    direita('Valor', colunas[3]! - 10, negrito, 9)
    direita('Pago', colunas[4]! - 10, negrito, 9)
    texto('Situação', colunas[4]!, negrito, 9)
    y -= 13
  }
  y -= 10
  garantir(40)
  texto('Parcelas', MARGEM, negrito, 12)
  y -= 18
  cabecalhoParcelas()
  for (const p of d.parcelas) {
    if (y - 12 < MARGEM + 24) {
      novaPagina()
      cabecalhoParcelas()
    }
    texto(p.numero, colunas[0]!, normal, 9)
    texto(p.vencimento, colunas[1]!, normal, 9)
    direita(p.valor, colunas[3]! - 10, normal, 9)
    direita(p.pago, colunas[4]! - 10, normal, 9)
    texto(p.situacao, colunas[4]!, normal, 9)
    y -= 12
  }

  y -= 12
  garantir(40)
  texto('Pagamentos recebidos', MARGEM, negrito, 12)
  y -= 18
  if (d.pagamentos.length === 0) {
    texto('Nenhum pagamento registrado.', MARGEM, normal, 9, CINZA)
    y -= 12
  }
  for (const p of d.pagamentos) {
    garantir(12)
    texto(p.data, colunas[0]!, normal, 9)
    texto(`Parcela ${p.parcela}`, colunas[2]!, normal, 9)
    direita(p.valor, fim, normal, 9)
    y -= 12
  }

  // Rodapé com a numeração em todas as páginas.
  const paginas = pdf.getPages()
  paginas.forEach((pg, i) => {
    pg.drawText(`${d.rodape} · página ${i + 1} de ${paginas.length}`, {
      x: MARGEM,
      y: MARGEM - 20,
      size: 8,
      font: normal,
      color: CINZA,
    })
  })
  return pdf.save()
}
