'use server'

import { ErroAplicacao, ferramentasDoAssistente } from '@norteia/aplicacao'
import { clienteClaude, responderPergunta } from '@norteia/integracoes/assistente'
import { exigirContexto } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

export interface TrocaAssistente {
  pergunta: string
  resposta: string
  fontes: string[]
  /** Valores da resposta que não vieram das consultas (aviso ao usuário). */
  naoConferidos: string[]
}

const NOMES_FONTE: Record<string, string> = {
  resumo_loteadora: 'painel da loteadora',
  carteira_empreendimento: 'carteira',
  viabilidade_empreendimento: 'motor financeiro (plano e fluxo atual)',
}

/** Uma pergunta ao assistente; só leitura, com as permissões de quem pergunta. */
export async function perguntar(
  historico: TrocaAssistente[],
  pergunta: string,
): Promise<TrocaAssistente | { erro: string }> {
  const ctx = await exigirContexto()
  const texto = pergunta.trim()
  if (texto.length < 3) return { erro: 'Escreva a pergunta.' }
  if (texto.length > 1000) return { erro: 'Pergunta longa demais (até 1.000 caracteres).' }
  if (!process.env.ANTHROPIC_API_KEY)
    return { erro: 'O assistente ainda não foi ativado nesta instalação.' }
  try {
    const r = await responderPergunta({
      cliente: clienteClaude(),
      pergunta: texto,
      historico: historico.slice(-6).map((h) => ({ pergunta: h.pergunta, resposta: h.resposta })),
      ferramentas: ferramentasDoAssistente(ctx.db, ctx.tenant.id, hojeSaoPaulo()),
    })
    return {
      pergunta: texto,
      resposta: r.texto,
      naoConferidos: r.naoConferidos,
      fontes: [
        ...new Set(
          r.fontes.map((f) =>
            [NOMES_FONTE[f.ferramenta] ?? f.ferramenta, f.entrada.empreendimento]
              .filter(Boolean)
              .join(': '),
          ),
        ),
      ],
    }
  } catch (e) {
    if (e instanceof ErroAplicacao) return { erro: e.message }
    console.error('assistente', e)
    return { erro: 'Não foi possível consultar o assistente agora. Tente de novo em instantes.' }
  }
}
