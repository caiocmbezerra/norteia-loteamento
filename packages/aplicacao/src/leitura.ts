import type { ClienteBanco } from '@norteia/db'
import { formatarData, formatarMoeda } from '@norteia/dominio'
import {
  type ClienteLeitura,
  TIPOS_DOCUMENTO_LIDO,
  type TipoDocumentoLido,
  lerDocumentoFiscal,
} from '@norteia/integracoes/leitura-documento'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import { ErroAplicacao, traduzirErroBanco } from './erros'

/** Campos já no formato do formulário de conta a pagar, para o usuário conferir. */
export interface SugestaoConta {
  centro: string | null
  fornecedorId: string | null
  /** Emitente que não está no cadastro de fornecedores (nome e documento). */
  fornecedorNovo: string | null
  descricao: string
  valor: string | null
  vencimento: string | null
  documentoNumero: string | null
  confianca: 'alta' | 'media' | 'baixa'
  avisos: string[]
}

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|me|epp|eireli|s\/?a)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Lê uma nota, boleto ou recibo e sugere a conta a pagar (nada é gravado). */
export async function sugerirContaDeDocumento(
  db: ClienteBanco,
  tenantId: string,
  arquivo: { base64: string; tipo: string },
  cliente: ClienteLeitura,
): Promise<SugestaoConta> {
  if (!(TIPOS_DOCUMENTO_LIDO as readonly string[]).includes(arquivo.tipo))
    throw new ErroAplicacao('Envie um PDF ou uma foto (JPG, PNG ou WEBP).', 'invalido')
  const [centros, fornecedores] = await Promise.all([
    db.from('centros_custo').select('codigo, nome').eq('tenant_id', tenantId).eq('ativo', true),
    db.from('fornecedores').select('id, nome, documento').eq('tenant_id', tenantId),
  ])
  for (const r of [centros, fornecedores]) if (r.error) throw traduzirErroBanco(r.error)
  const { sugestao: s, recusada } = await lerDocumentoFiscal({
    cliente,
    arquivo: { base64: arquivo.base64, tipo: arquivo.tipo as TipoDocumentoLido },
    centros: centros.data ?? [],
  })
  if (!s)
    throw new ErroAplicacao(
      recusada
        ? 'Não foi possível ler este documento.'
        : 'Não consegui ler o documento; preencha à mão.',
      'invalido',
    )
  const lista = fornecedores.data ?? []
  const fornecedor =
    (s.fornecedor_documento &&
      lista.find((f) => f.documento?.replace(/\D/g, '') === s.fornecedor_documento)) ||
    (s.fornecedor_nome &&
      lista.find((f) => normalizar(f.nome) === normalizar(s.fornecedor_nome!))) ||
    null
  const avisos: string[] = []
  if (s.observacoes) avisos.push(s.observacoes)
  if (!s.valor_centavos) avisos.push('Valor não encontrado.')
  if (!s.vencimento) avisos.push('Vencimento não encontrado.')
  if (!s.centro_codigo) avisos.push('Escolha o centro de custo.')
  if (s.data_emissao) avisos.push(`Emitido em ${formatarData(s.data_emissao)}.`)
  return {
    centro: s.centro_codigo,
    fornecedorId: fornecedor?.id ?? null,
    fornecedorNovo:
      !fornecedor && s.fornecedor_nome
        ? `${s.fornecedor_nome}${s.fornecedor_documento ? ` (${s.fornecedor_documento})` : ''}`
        : null,
    descricao: s.descricao,
    valor: s.valor_centavos
      ? formatarMoeda(arredondarCentavos(String(s.valor_centavos))).replace(/^R\$\s/, '')
      : null,
    vencimento: s.vencimento,
    documentoNumero: s.documento_numero,
    confianca: s.confianca,
    avisos,
  }
}
