import { ErroAplicacao, gerarDocumentoPortal } from '@norteia/aplicacao'
import { exigirUsuario } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

/** Contrato ou termo de quitação baixado pelo próprio comprador. */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; tipo: string }> },
) {
  const { id, tipo } = await params
  if (tipo !== 'contrato' && tipo !== 'quitacao')
    return new Response('Documento desconhecido.', { status: 404 })
  const { db } = await exigirUsuario()
  try {
    const doc = await gerarDocumentoPortal(db, id, tipo, hojeSaoPaulo())
    if (!doc) return new Response('Contrato não encontrado.', { status: 404 })
    return new Response(Buffer.from(doc.conteudo), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${doc.nomeArquivo}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    if (e instanceof ErroAplicacao) return new Response(e.message, { status: 422 })
    throw e
  }
}
