import type { ClienteBanco } from '@norteia/db'
import { traduzirErroBanco } from './erros'

/**
 * Dados do comprador do contrato em JSON (LGPD, art. 18: acesso e portabilidade), para o próprio
 * titular ou para o dono da loteadora. Nulo sem permissão. Cada exportação fica registrada.
 */
export async function exportarDadosTitular(
  db: ClienteBanco,
  contratoId: string,
): Promise<{ nomeArquivo: string; conteudo: string } | null> {
  const { data, error } = await db.rpc('dados_titular_do_contrato', { p_contrato: contratoId })
  if (error?.code === '42501') return null
  if (error) throw traduzirErroBanco(error)
  const dados = data as { cadastro?: { nome?: string } }
  const nome = (dados.cadastro?.nome ?? 'titular')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return { nomeArquivo: `dados-${nome}.json`, conteudo: JSON.stringify(data, null, 2) }
}
