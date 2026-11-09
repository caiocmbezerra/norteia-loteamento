import Anthropic from '@anthropic-ai/sdk'

/**
 * Assistente de perguntas em linguagem natural (Fase 8b). O modelo só lê os números por
 * ferramentas que chamam o motor com as permissões do usuário; não calcula nada por conta própria.
 * Laço manual de tool use (API estável), sem ferramentas de escrita.
 */
export const MODELO_ASSISTENTE = 'claude-opus-5-5'

export interface FerramentaAssistente {
  nome: string
  descricao: string
  /** JSON Schema do input (objeto). */
  esquema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
  executar(entrada: Record<string, unknown>): Promise<string>
}

export interface FonteResposta {
  ferramenta: string
  entrada: Record<string, unknown>
}

export interface RespostaAssistente {
  texto: string
  fontes: FonteResposta[]
  recusada: boolean
  /** Valores (R$ e %) da resposta que não vieram de nenhuma ferramenta. */
  naoConferidos: string[]
}

const NUMEROS = /R\$\s?-?[\d.]+,\d{2}|-?\d+(?:,\d+)?\s?%/g
const normalizarNumero = (n: string) => n.replace(/\s/g, '')

/** Valores monetários e percentuais da resposta ausentes dos resultados das ferramentas. */
export function numerosNaoConferidos(resposta: string, resultados: readonly string[]): string[] {
  const base = new Set(resultados.flatMap((r) => (r.match(NUMEROS) ?? []).map(normalizarNumero)))
  return [...new Set((resposta.match(NUMEROS) ?? []).map(normalizarNumero))].filter(
    (n) => !base.has(n),
  )
}

/** Só o que o laço usa do cliente (permite um cliente falso nos testes). */
export interface ClienteClaude {
  beta: {
    messages: {
      create(
        p: Anthropic.Beta.MessageCreateParamsNonStreaming,
      ): PromiseLike<Anthropic.Beta.BetaMessage>
    }
  }
}

const SISTEMA = `Você é o assistente financeiro do NorteIA Loteamento, para loteadoras brasileiras.
Responda em português do Brasil, em poucas frases, para quem não é especialista.
Números: use somente os que as ferramentas devolverem, copiados exatamente como vieram (valores
em R$ e percentuais já formatados). Nunca calcule, estime, arredonde ou invente um número; se a
pergunta pedir um número que nenhuma ferramenta traz, diga que o sistema não tem essa informação.
Ao final, diga de onde veio cada número (por exemplo: "Fonte: carteira do Jardim das Flores").
As ferramentas já respeitam as permissões do usuário: se algo não aparece, ele não tem acesso.
Não dê aconselhamento jurídico ou tributário; nesses casos, recomende falar com o advogado ou o
contador da loteadora.`

/** Responde uma pergunta usando as ferramentas; `historico` são as trocas anteriores em texto. */
export async function responderPergunta({
  cliente,
  pergunta,
  historico,
  ferramentas,
  maxRodadas = 8,
}: {
  cliente: ClienteClaude
  pergunta: string
  historico: { pergunta: string; resposta: string }[]
  ferramentas: FerramentaAssistente[]
  maxRodadas?: number
}): Promise<RespostaAssistente> {
  const porNome = new Map(ferramentas.map((f) => [f.nome, f]))
  const tools: Anthropic.Beta.BetaTool[] = ferramentas.map((f) => ({
    name: f.nome,
    description: f.descricao,
    input_schema: f.esquema,
  }))
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...historico.flatMap((h): Anthropic.Beta.BetaMessageParam[] => [
      { role: 'user', content: h.pergunta },
      { role: 'assistant', content: h.resposta },
    ]),
    { role: 'user', content: pergunta },
  ]
  const fontes: FonteResposta[] = []
  const resultadosTexto: string[] = []

  for (let rodada = 0; rodada < maxRodadas; rodada++) {
    const resposta = await cliente.beta.messages.create({
      model: MODELO_ASSISTENTE,
      max_tokens: 16000,
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools,
      messages,
    })
    if (resposta.stop_reason === 'refusal')
      return {
        texto: 'Não posso responder a essa pergunta.',
        fontes,
        recusada: true,
        naoConferidos: [],
      }
    // Histórico só cresce (o conteúdo da resposta volta inteiro, como veio).
    messages.push({ role: 'assistant', content: resposta.content })
    const chamadas = resposta.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
    )
    if (resposta.stop_reason !== 'tool_use' || chamadas.length === 0) {
      const texto = resposta.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim()
      const final = texto || 'Não consegui responder.'
      return {
        texto: final,
        fontes,
        recusada: false,
        naoConferidos: numerosNaoConferidos(final, resultadosTexto),
      }
    }
    const resultados = await Promise.all(
      chamadas.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const f = porNome.get(c.name)
        const entrada = (c.input ?? {}) as Record<string, unknown>
        if (!f)
          return {
            type: 'tool_result',
            tool_use_id: c.id,
            content: 'Ferramenta desconhecida.',
            is_error: true,
          }
        try {
          const conteudo = await f.executar(entrada)
          fontes.push({ ferramenta: c.name, entrada })
          resultadosTexto.push(conteudo)
          return { type: 'tool_result', tool_use_id: c.id, content: conteudo }
        } catch (e) {
          return {
            type: 'tool_result',
            tool_use_id: c.id,
            content: e instanceof Error ? e.message : 'Erro ao consultar.',
            is_error: true,
          }
        }
      }),
    )
    messages.push({ role: 'user', content: resultados })
  }
  return {
    texto: 'A pergunta exigiu consultas demais; tente ser mais específico.',
    fontes,
    recusada: false,
    naoConferidos: [],
  }
}

/** Cliente real (chave em ANTHROPIC_API_KEY no servidor). */
export function clienteClaude(): ClienteClaude {
  return new Anthropic()
}
