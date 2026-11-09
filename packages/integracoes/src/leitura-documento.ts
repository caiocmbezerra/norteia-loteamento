import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import { MODELO_ASSISTENTE } from './assistente'

/**
 * Leitura de nota fiscal, boleto ou recibo (Fase 8d): extrai os campos de uma conta a pagar para o
 * usuário conferir. Nada é gravado aqui; valores voltam em centavos e datas em AAAA-MM-DD.
 */
export const SugestaoDocumento = z.object({
  fornecedor_nome: z
    .string()
    .nullable()
    .describe('Razão social ou nome de quem emitiu o documento'),
  fornecedor_documento: z.string().nullable().describe('CNPJ ou CPF do emitente, só dígitos'),
  documento_numero: z.string().nullable().describe('Número da nota, boleto ou recibo'),
  data_emissao: z.string().nullable().describe('Data de emissão, AAAA-MM-DD'),
  vencimento: z.string().nullable().describe('Data de vencimento, AAAA-MM-DD'),
  valor_centavos: z.number().int().nullable().describe('Valor total a pagar, em centavos'),
  descricao: z.string().describe('Descrição curta do serviço ou material, em português'),
  centro_codigo: z
    .string()
    .nullable()
    .describe('Código do centro de custo mais adequado, da lista dada'),
  confianca: z.enum(['alta', 'media', 'baixa']).describe('Confiança geral na leitura'),
  observacoes: z
    .string()
    .nullable()
    .describe('Algo que o usuário deva conferir (ilegível, divergente, ausente)'),
})
export type SugestaoDocumento = z.infer<typeof SugestaoDocumento>

export const TIPOS_DOCUMENTO_LIDO = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const
export type TipoDocumentoLido = (typeof TIPOS_DOCUMENTO_LIDO)[number]

export interface ClienteLeitura {
  beta: {
    messages: {
      parse(
        p: Anthropic.Beta.MessageCreateParamsNonStreaming,
      ): PromiseLike<{ stop_reason: string | null; parsed_output?: unknown }>
    }
  }
}

const DATA = /^\d{4}-\d{2}-\d{2}$/

/** Lê o documento e devolve a sugestão já saneada (centro só da lista, datas e valor válidos). */
export async function lerDocumentoFiscal({
  cliente,
  arquivo,
  centros,
}: {
  cliente: ClienteLeitura
  arquivo: { base64: string; tipo: TipoDocumentoLido }
  centros: { codigo: string; nome: string }[]
}): Promise<{ sugestao: SugestaoDocumento | null; recusada: boolean }> {
  const anexo: Anthropic.Beta.BetaContentBlockParam =
    arquivo.tipo === 'application/pdf'
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: arquivo.base64 },
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: arquivo.tipo, data: arquivo.base64 },
        }
  const resposta = await cliente.beta.messages.parse({
    model: MODELO_ASSISTENTE,
    max_tokens: 4000,
    output_config: { effort: 'low', format: betaZodOutputFormat(SugestaoDocumento) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [
      {
        role: 'user',
        content: [
          anexo,
          {
            type: 'text',
            text: `Este é um documento de despesa de um loteamento no Brasil (nota fiscal, boleto ou recibo).
Extraia os campos para lançar uma conta a pagar. Use null quando a informação não estiver no documento;
não adivinhe. Valor total em centavos (R$ 1.234,56 = 123456). Escolha o centro de custo só entre estes:
${centros.map((c) => `${c.codigo} = ${c.nome}`).join('\n')}`,
          },
        ],
      },
    ],
  })
  if (resposta.stop_reason === 'refusal') return { sugestao: null, recusada: true }
  const s = SugestaoDocumento.safeParse(resposta.parsed_output)
  if (!s.success) return { sugestao: null, recusada: false }
  const v = s.data
  return {
    recusada: false,
    sugestao: {
      ...v,
      fornecedor_documento: v.fornecedor_documento?.replace(/\D/g, '') || null,
      data_emissao: v.data_emissao && DATA.test(v.data_emissao) ? v.data_emissao : null,
      vencimento: v.vencimento && DATA.test(v.vencimento) ? v.vencimento : null,
      valor_centavos: v.valor_centavos !== null && v.valor_centavos > 0 ? v.valor_centavos : null,
      centro_codigo: centros.some((c) => c.codigo === v.centro_codigo) ? v.centro_codigo : null,
    },
  }
}

/** Cliente real (chave em ANTHROPIC_API_KEY no servidor). */
export function clienteLeitura(): ClienteLeitura {
  return new Anthropic()
}
