import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import {
  type ClienteClaude,
  type FerramentaAssistente,
  numerosNaoConferidos,
  responderPergunta,
} from './assistente'

type Bloco = Anthropic.Beta.BetaContentBlock
function mensagem(content: unknown[], stop: string): Anthropic.Beta.BetaMessage {
  return { content: content as Bloco[], stop_reason: stop } as unknown as Anthropic.Beta.BetaMessage
}
function falso(respostas: Anthropic.Beta.BetaMessage[]) {
  const pedidos: Anthropic.Beta.MessageCreateParamsNonStreaming[] = []
  const cliente: ClienteClaude = {
    beta: {
      messages: {
        create: async (p) => {
          pedidos.push(structuredClone(p))
          return respostas.shift()!
        },
      },
    },
  }
  return { cliente, pedidos }
}

const carteira: FerramentaAssistente = {
  nome: 'carteira_empreendimento',
  descricao: 'Carteira',
  esquema: {
    type: 'object',
    properties: { empreendimento: { type: 'string' } },
    required: ['empreendimento'],
  },
  executar: async (e) => {
    if (e.empreendimento === 'erro') throw new Error('Empreendimento não encontrado.')
    return 'Saldo a receber: R$ 120.500,00'
  },
}

describe('assistente', () => {
  it('chama a ferramenta, devolve o resultado ao modelo e cita a fonte', async () => {
    const { cliente, pedidos } = falso([
      mensagem(
        [
          {
            type: 'tool_use',
            id: 't1',
            name: 'carteira_empreendimento',
            input: { empreendimento: 'Jardim' },
          },
        ],
        'tool_use',
      ),
      mensagem(
        [{ type: 'text', text: 'O saldo a receber é R$ 120.500,00. Fonte: carteira do Jardim.' }],
        'end_turn',
      ),
    ])
    const r = await responderPergunta({
      cliente,
      pergunta: 'Quanto tenho a receber no Jardim?',
      historico: [{ pergunta: 'Oi', resposta: 'Olá!' }],
      ferramentas: [carteira],
    })
    expect(r).toEqual({
      texto: 'O saldo a receber é R$ 120.500,00. Fonte: carteira do Jardim.',
      fontes: [{ ferramenta: 'carteira_empreendimento', entrada: { empreendimento: 'Jardim' } }],
      recusada: false,
      naoConferidos: [],
    })
    expect(pedidos[0]!.model).toBe('claude-opus-5-5')
    expect(pedidos[0]!.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(pedidos[1]!.messages.at(-1)).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'Saldo a receber: R$ 120.500,00' },
      ],
    })
  })

  it('erro da ferramenta e ferramenta desconhecida voltam como erro para o modelo', async () => {
    const { cliente, pedidos } = falso([
      mensagem(
        [
          {
            type: 'tool_use',
            id: 'a',
            name: 'carteira_empreendimento',
            input: { empreendimento: 'erro' },
          },
          { type: 'tool_use', id: 'b', name: 'apagar_tudo', input: {} },
        ],
        'tool_use',
      ),
      mensagem([{ type: 'text', text: 'Não encontrei.' }], 'end_turn'),
    ])
    const r = await responderPergunta({
      cliente,
      pergunta: 'x',
      historico: [],
      ferramentas: [carteira],
    })
    expect(r.fontes).toEqual([])
    expect(pedidos[1]!.messages.at(-1)!.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'a',
        content: 'Empreendimento não encontrado.',
        is_error: true,
      },
      {
        type: 'tool_result',
        tool_use_id: 'b',
        content: 'Ferramenta desconhecida.',
        is_error: true,
      },
    ])
  })

  it('trata recusa, resposta vazia e excesso de rodadas', async () => {
    expect(
      (
        await responderPergunta({
          cliente: falso([mensagem([], 'refusal')]).cliente,
          pergunta: 'x',
          historico: [],
          ferramentas: [],
        })
      ).recusada,
    ).toBe(true)
    expect(
      (
        await responderPergunta({
          cliente: falso([mensagem([], 'end_turn')]).cliente,
          pergunta: 'x',
          historico: [],
          ferramentas: [],
        })
      ).texto,
    ).toBe('Não consegui responder.')
    const laco = mensagem(
      [
        {
          type: 'tool_use',
          id: 't',
          name: 'carteira_empreendimento',
          input: { empreendimento: 'J' },
        },
      ],
      'tool_use',
    )
    const r = await responderPergunta({
      cliente: falso([laco, laco]).cliente,
      pergunta: 'x',
      historico: [],
      ferramentas: [carteira],
      maxRodadas: 2,
    })
    expect(r.texto).toMatch(/consultas demais/)
    expect(r.fontes).toHaveLength(2)
  })
})

describe('conferência dos números', () => {
  it('aponta valores da resposta que não vieram das ferramentas', () => {
    const fonte = ['Saldo R$ 120.500,00; TIR 19,3% ao ano; vencido R$ 0,00']
    expect(numerosNaoConferidos('Saldo de R$ 120.500,00 e TIR de 19,3 %.', fonte)).toEqual([])
    expect(numerosNaoConferidos('Saldo de R$ 121.000,00, TIR 19,3% e 25% a mais.', fonte)).toEqual([
      'R$121.000,00',
      '25%',
    ])
    expect(numerosNaoConferidos('Sem números.', [])).toEqual([])
  })

  it('a resposta final traz os valores não conferidos', async () => {
    const { cliente } = falso([
      mensagem(
        [
          {
            type: 'tool_use',
            id: 't1',
            name: 'carteira_empreendimento',
            input: { empreendimento: 'J' },
          },
        ],
        'tool_use',
      ),
      mensagem(
        [{ type: 'text', text: 'Saldo R$ 120.500,00, mas uns R$ 99,00 de juros.' }],
        'end_turn',
      ),
    ])
    const r = await responderPergunta({
      cliente,
      pergunta: 'x',
      historico: [],
      ferramentas: [carteira],
    })
    expect(r.naoConferidos).toEqual(['R$99,00'])
  })
})
