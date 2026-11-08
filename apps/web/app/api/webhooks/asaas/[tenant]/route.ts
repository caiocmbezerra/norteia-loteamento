import type { Database } from '@norteia/db'
import { createClient } from '@supabase/supabase-js'
import { configSupabase } from '@/lib/env'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Webhook do Asaas. Só repassa o aviso ao banco (`webhook_asaas`), que confere o token do
 * tenant e lê o pagamento no próprio Asaas antes de baixar a parcela. Sem chave de serviço.
 */
export async function POST(
  requisicao: Request,
  { params }: { params: Promise<{ tenant: string }> },
) {
  const { tenant } = await params
  const token = requisicao.headers.get('asaas-access-token')
  if (!UUID.test(tenant) || !token)
    return Response.json({ erro: 'não autorizado' }, { status: 401 })
  let evento: unknown
  try {
    evento = await requisicao.json()
  } catch {
    return Response.json({ erro: 'corpo inválido' }, { status: 400 })
  }
  if (typeof evento !== 'object' || evento === null)
    return Response.json({ erro: 'corpo inválido' }, { status: 400 })

  const { url, chave } = configSupabase()
  const db = createClient<Database>(url, chave, { auth: { persistSession: false } })
  const { data, error } = await db.rpc('webhook_asaas', {
    p_tenant: tenant,
    p_token: token,
    p_evento: evento as Database['public']['Functions']['webhook_asaas']['Args']['p_evento'],
  })
  // Erro → 500: o Asaas reenvia o aviso mais tarde (a baixa é idempotente).
  if (error) return Response.json({ erro: 'falha ao processar' }, { status: 500 })
  if (data === 'nao_autorizado') return Response.json({ erro: 'não autorizado' }, { status: 401 })
  return Response.json({ resultado: data })
}
