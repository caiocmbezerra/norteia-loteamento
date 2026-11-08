import Docxtemplater from 'docxtemplater'
import PizZip from 'pizzip'
import { MODELOS_PADRAO } from './modelos-padrao.gerado'

export const TIPOS_DOCUMENTO = [
  'contrato',
  'quitacao',
  'aditivo_renegociacao',
  'aditivo_cessao',
  'aditivo_troca_lote',
  'informe_pagamentos',
] as const
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number]

export class ErroModelo extends Error {
  override readonly name = 'ErroModelo'
}

/** Valores de um documento: textos já formatados e listas (parcelas, pagamentos). */
export type DadosDocumento = Record<string, string | Record<string, string>[]>

export function modeloPadrao(tipo: TipoDocumento): Uint8Array {
  return Uint8Array.from(atob(MODELOS_PADRAO[tipo]), (c) => c.charCodeAt(0))
}

function motivoDoErro(e: unknown): string {
  const erros = (
    e as { properties?: { errors?: { properties?: { explanation?: string; xtag?: string } }[] } }
  ).properties?.errors
  if (erros?.length) {
    const marcadores = erros
      .map((x) => x.properties?.xtag)
      .filter(Boolean)
      .slice(0, 3)
    return marcadores.length
      ? `marcadores com problema: ${marcadores.map((m) => `{${m}}`).join(', ')}`
      : 'marcadores mal formados'
  }
  return 'o arquivo não é um Word (.docx) válido'
}

/**
 * Preenche um modelo DOCX com os dados. Marcadores no formato {comprador_nome}; tabela de
 * parcelas com {#parcelas}…{/parcelas}. Marcador desconhecido fica em branco.
 */
export function preencherModelo(modelo: Uint8Array, dados: DadosDocumento): Uint8Array {
  let doc: Docxtemplater
  try {
    doc = new Docxtemplater(new PizZip(modelo), {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => '',
    })
    doc.render(dados)
  } catch (e) {
    throw new ErroModelo(`Não foi possível usar o modelo: ${motivoDoErro(e)}.`)
  }
  return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' })
}

/** Texto simples do documento (para conferência e testes). */
export function textoDoDocumento(docx: Uint8Array): string {
  const xml = new PizZip(docx).file('word/document.xml')?.asText() ?? ''
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .trim()
}
