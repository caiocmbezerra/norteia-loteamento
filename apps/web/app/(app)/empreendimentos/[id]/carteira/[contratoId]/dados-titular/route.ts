import { exportarDadosTitular } from '@norteia/aplicacao'
import { exigirContexto } from '@/lib/contexto'

/** O dono baixa os dados do comprador para atender um pedido do titular (LGPD, art. 18). */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; contratoId: string }> },
) {
  const { contratoId } = await params
  const { db } = await exigirContexto()
  const r = await exportarDadosTitular(db, contratoId)
  if (!r) return new Response('Contrato não encontrado.', { status: 404 })
  return new Response(r.conteudo, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${r.nomeArquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
