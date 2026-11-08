import {
  ErroAplicacao,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
  gerarDocumento,
} from '@norteia/aplicacao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Documento do contrato (ou de um aditivo) preenchido com o modelo em uso da loteadora. */
export async function GET(
  requisicao: Request,
  { params }: { params: Promise<{ id: string; contratoId: string; tipo: string }> },
) {
  const { contratoId, tipo } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador', 'comercial_gestor'))
    return new Response('Sem permissão.', { status: 403 })
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo))
    return new Response('Documento desconhecido.', { status: 404 })
  const aditivo = new URL(requisicao.url).searchParams.get('aditivo') ?? undefined
  try {
    const doc = await gerarDocumento(
      ctx.db,
      ctx.tenant.id,
      contratoId,
      tipo as TipoDocumento,
      hojeSaoPaulo(),
      aditivo,
    )
    return new Response(Buffer.from(doc.conteudo), {
      headers: {
        'Content-Type': DOCX,
        'Content-Disposition': `attachment; filename="${doc.nomeArquivo}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    if (e instanceof ErroAplicacao) return new Response(e.message, { status: 422 })
    throw e
  }
}
