import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { type ClienteLeitura, lerDocumentoFiscal } from './leitura-documento'

function falso(saida: { stop_reason: string; parsed_output?: unknown }) {
  const pedidos: Anthropic.Beta.MessageCreateParamsNonStreaming[] = []
  const cliente: ClienteLeitura = {
    beta: { messages: { parse: async (p) => (pedidos.push(p), saida) } },
  }
  return { cliente, pedidos }
}
const centros = [{ codigo: 'infraestrutura.drenagem', nome: 'Drenagem' }]
const lido = {
  fornecedor_nome: 'Terraplenagem Silva Ltda',
  fornecedor_documento: '11.222.333/0001-81',
  documento_numero: '1234',
  data_emissao: '2026-10-01',
  vencimento: '10/11/2026',
  valor_centavos: 1_234_56,
  descricao: 'Drenagem — medição 1',
  centro_codigo: 'infraestrutura.drenagem',
  confianca: 'alta',
  observacoes: null,
}

describe('leitura de nota ou recibo', () => {
  it('envia o PDF com os centros e saneia a sugestão', async () => {
    const { cliente, pedidos } = falso({ stop_reason: 'end_turn', parsed_output: lido })
    const r = await lerDocumentoFiscal({
      cliente,
      arquivo: { base64: 'JVBERi0=', tipo: 'application/pdf' },
      centros,
    })
    expect(r.sugestao).toMatchObject({
      fornecedor_documento: '11222333000181',
      vencimento: null, // fora do formato AAAA-MM-DD
      data_emissao: '2026-10-01',
      valor_centavos: 123_456,
      centro_codigo: 'infraestrutura.drenagem',
    })
    const conteudo = pedidos[0]!.messages[0]!.content as Anthropic.Beta.BetaContentBlockParam[]
    expect(conteudo[0]).toMatchObject({
      type: 'document',
      source: { media_type: 'application/pdf' },
    })
    expect((conteudo[1] as { text: string }).text).toContain('infraestrutura.drenagem = Drenagem')
  })

  it('foto, centro fora da lista, valor inválido e documento vazio viram nulos', async () => {
    const { cliente, pedidos } = falso({
      stop_reason: 'end_turn',
      parsed_output: {
        ...lido,
        centro_codigo: 'inventado',
        valor_centavos: 0,
        fornecedor_documento: '',
        vencimento: '2026-11-10',
      },
    })
    const r = await lerDocumentoFiscal({
      cliente,
      arquivo: { base64: 'x', tipo: 'image/jpeg' },
      centros,
    })
    expect(r.sugestao).toMatchObject({
      centro_codigo: null,
      valor_centavos: null,
      fornecedor_documento: null,
      vencimento: '2026-11-10',
    })
    expect(
      (pedidos[0]!.messages[0]!.content as Anthropic.Beta.BetaContentBlockParam[])[0],
    ).toMatchObject({ type: 'image' })
  })

  it('recusa e saída inválida não sugerem nada', async () => {
    expect(
      await lerDocumentoFiscal({
        cliente: falso({ stop_reason: 'refusal' }).cliente,
        arquivo: { base64: 'x', tipo: 'image/png' },
        centros,
      }),
    ).toEqual({ sugestao: null, recusada: true })
    expect(
      await lerDocumentoFiscal({
        cliente: falso({ stop_reason: 'end_turn', parsed_output: { qualquer: 1 } }).cliente,
        arquivo: { base64: 'x', tipo: 'image/png' },
        centros,
      }),
    ).toEqual({ sugestao: null, recusada: false })
  })
})
