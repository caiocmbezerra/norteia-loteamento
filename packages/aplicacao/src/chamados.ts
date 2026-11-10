import type { ClienteBanco } from '@norteia/db'
import { traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export const CATEGORIAS_CHAMADO = {
  financeiro: 'Financeiro (boletos, pagamentos)',
  documentos: 'Documentos',
  obra: 'Obras e infraestrutura',
  escritura: 'Escritura e registro',
  outro: 'Outro assunto',
} as const
export type CategoriaChamado = keyof typeof CATEGORIAS_CHAMADO

export const SITUACOES_CHAMADO = {
  aberto: 'Aberto',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
} as const
export type SituacaoChamado = keyof typeof SITUACOES_CHAMADO

export interface MensagemChamado {
  id: string
  autorComprador: boolean
  texto: string
  criadoEm: string
}

export interface Chamado {
  id: string
  contratoId: string
  assunto: string
  categoria: CategoriaChamado
  situacao: SituacaoChamado
  ultimaMensagemEm: string
  mensagens: MensagemChamado[]
}

/** Abre um chamado sobre o próprio contrato (comprador), com a primeira mensagem. */
export async function abrirChamado(
  db: ClienteBanco,
  contratoId: string,
  c: { assunto: string; categoria: CategoriaChamado; texto: string },
): Promise<string> {
  const { data, error } = await db.rpc('abrir_chamado', {
    p_contrato: contratoId,
    p_assunto: c.assunto,
    p_categoria: c.categoria,
    p_texto: c.texto,
  })
  falhar(error)
  return data!
}

export async function responderChamado(db: ClienteBanco, chamadoId: string, texto: string) {
  const { error } = await db.rpc('responder_chamado', { p_chamado: chamadoId, p_texto: texto })
  falhar(error)
}

export async function mudarSituacaoChamado(
  db: ClienteBanco,
  chamadoId: string,
  situacao: SituacaoChamado,
) {
  const { error } = await db.rpc('mudar_situacao_chamado', {
    p_chamado: chamadoId,
    p_situacao: situacao,
  })
  falhar(error)
}

/** Um chamado com a conversa (nulo se o usuário não tem acesso). */
export async function carregarChamado(
  db: ClienteBanco,
  chamadoId: string,
): Promise<Chamado | null> {
  const { data, error } = await db
    .from('chamados')
    .select(
      'id, contrato_id, assunto, categoria, situacao, ultima_mensagem_em, chamado_mensagens(id, autor_comprador, texto, criado_em)',
    )
    .eq('id', chamadoId)
    .maybeSingle()
  falhar(error)
  if (!data) return null
  return {
    id: data.id,
    contratoId: data.contrato_id,
    assunto: data.assunto,
    categoria: data.categoria as CategoriaChamado,
    situacao: data.situacao as SituacaoChamado,
    ultimaMensagemEm: data.ultima_mensagem_em,
    mensagens: data.chamado_mensagens
      .map((m) => ({
        id: m.id,
        autorComprador: m.autor_comprador,
        texto: m.texto,
        criadoEm: m.criado_em,
      }))
      .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)),
  }
}
