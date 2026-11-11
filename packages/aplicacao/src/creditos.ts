import type { ClienteBanco } from '@norteia/db'
import { traduzirErroBanco } from './erros'

type ErroBanco = { code?: string; message: string; hint?: string | null }
function falhar(error: ErroBanco | null) {
  if (error) throw traduzirErroBanco(error)
}

export interface UsoCredito {
  id: string
  tipo: 'parcela' | 'devolucao'
  data: string
  valorCentavos: number
  /** Aplicação cujo recebimento foi estornado: não conta no saldo. */
  estornado: boolean
  observacao: string | null
}

export interface CreditoComprador {
  id: string
  data: string
  valorCentavos: number
  observacao: string
  cancelado: boolean
  motivoCancelamento: string | null
  saldoCentavos: number
  usos: UsoCredito[]
}

/** Créditos por pagamento a maior do contrato, com o saldo de cada um (D-114). */
export async function carregarCreditos(
  db: ClienteBanco,
  contratoId: string,
): Promise<CreditoComprador[]> {
  const { data, error } = await db
    .from('creditos_comprador')
    .select(
      'id, data, valor_centavos, observacao, cancelado_em, motivo_cancelamento, usos_credito(id, tipo, data, valor_centavos, observacao, criado_em, recebimentos(estornado_em))',
    )
    .eq('contrato_id', contratoId)
    .order('data')
    .order('criado_em')
  falhar(error)
  return (data ?? []).map((c) => {
    const usos: UsoCredito[] = [...c.usos_credito]
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em))
      .map((u) => ({
        id: u.id,
        tipo: u.tipo as UsoCredito['tipo'],
        data: u.data,
        valorCentavos: u.valor_centavos,
        estornado: u.recebimentos?.estornado_em != null,
        observacao: u.observacao,
      }))
    const usado = usos.filter((u) => !u.estornado).reduce((t, u) => t + u.valorCentavos, 0)
    return {
      id: c.id,
      data: c.data,
      valorCentavos: c.valor_centavos,
      observacao: c.observacao,
      cancelado: c.cancelado_em !== null,
      motivoCancelamento: c.motivo_cancelamento,
      saldoCentavos: c.cancelado_em !== null ? 0 : c.valor_centavos - usado,
      usos,
    }
  })
}

export async function registrarCredito(
  db: ClienteBanco,
  contratoId: string,
  d: { data: string; valorCentavos: number; observacao: string },
): Promise<string> {
  const { data, error } = await db.rpc('registrar_credito', {
    p_contrato: contratoId,
    p_data: d.data,
    p_valor: d.valorCentavos,
    p_observacao: d.observacao,
  })
  falhar(error)
  return data as string
}

export async function aplicarCredito(
  db: ClienteBanco,
  creditoId: string,
  parcelaId: string,
  valorCentavos: number,
): Promise<void> {
  const { error } = await db.rpc('aplicar_credito', {
    p_credito: creditoId,
    p_parcela: parcelaId,
    p_valor: valorCentavos,
  })
  falhar(error)
}

export async function devolverCredito(
  db: ClienteBanco,
  creditoId: string,
  d: { data: string; valorCentavos: number; observacao: string | null },
): Promise<void> {
  const { error } = await db.rpc('devolver_credito', {
    p_credito: creditoId,
    p_data: d.data,
    p_valor: d.valorCentavos,
    ...(d.observacao ? { p_observacao: d.observacao } : {}),
  })
  falhar(error)
}

export async function cancelarCredito(
  db: ClienteBanco,
  creditoId: string,
  motivo: string,
): Promise<void> {
  const { error } = await db.rpc('cancelar_credito', { p_credito: creditoId, p_motivo: motivo })
  falhar(error)
}
