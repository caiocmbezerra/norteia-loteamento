import type { ClienteBanco } from '@norteia/db'
import { traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }

function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export interface IntegracaoAsaas {
  ambiente: 'sandbox' | 'producao'
  ativo: boolean
  ultimoWebhookEm: string | null
  atualizadoEm: string
}

export async function carregarIntegracaoAsaas(
  db: ClienteBanco,
  tenantId: string,
): Promise<IntegracaoAsaas | null> {
  const { data, error } = await db
    .from('integracoes_asaas')
    .select('ambiente, ativo, ultimo_webhook_em, atualizado_em')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  falhar(error)
  return data
    ? {
        ambiente: data.ambiente as IntegracaoAsaas['ambiente'],
        ativo: data.ativo,
        ultimoWebhookEm: data.ultimo_webhook_em,
        atualizadoEm: data.atualizado_em,
      }
    : null
}

/** Confere a chave no Asaas, guarda no Vault e devolve o token do webhook (mostrado uma vez). */
export async function configurarAsaas(
  db: ClienteBanco,
  tenantId: string,
  ambiente: 'sandbox' | 'producao',
  chave: string,
): Promise<string> {
  const { data, error } = await db.rpc('configurar_asaas', {
    p_tenant: tenantId,
    p_ambiente: ambiente,
    p_chave: chave,
  })
  falhar(error)
  return data!
}

export async function desativarAsaas(db: ClienteBanco, tenantId: string) {
  const { error } = await db.rpc('desativar_asaas', { p_tenant: tenantId })
  falhar(error)
}

/** Boleto + Pix da parcela pelo saldo em aberto (RN-K04: multa e juros do contrato). */
export async function gerarCobranca(db: ClienteBanco, parcelaId: string): Promise<string> {
  const { data, error } = await db.rpc('gerar_cobranca', { p_parcela: parcelaId })
  falhar(error)
  return data!
}

export async function cancelarCobranca(db: ClienteBanco, cobrancaId: string, motivo: string) {
  const { error } = await db.rpc('cancelar_cobranca', { p_cobranca: cobrancaId, p_motivo: motivo })
  falhar(error)
}
