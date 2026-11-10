import { exportarDadosTitular } from '@norteia/aplicacao'
import { exigirUsuario } from '@/lib/contexto'

/** O comprador baixa tudo o que a loteadora guarda sobre ele (LGPD, art. 18). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await exigirUsuario()
  const r = await exportarDadosTitular(db, id)
  if (!r) return new Response('Contrato não encontrado.', { status: 404 })
  return new Response(r.conteudo, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${r.nomeArquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
