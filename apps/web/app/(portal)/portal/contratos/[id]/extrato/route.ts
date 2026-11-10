import { extratoPortalPdf } from '@norteia/aplicacao'
import { exigirUsuario } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

/** Extrato do contrato em PDF, baixado pelo próprio comprador. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await exigirUsuario()
  const extrato = await extratoPortalPdf(db, id, hojeSaoPaulo())
  if (!extrato) return new Response('Contrato não encontrado.', { status: 404 })
  return new Response(Buffer.from(extrato.conteudo), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${extrato.nomeArquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
