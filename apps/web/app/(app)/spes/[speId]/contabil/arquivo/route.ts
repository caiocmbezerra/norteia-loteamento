import { ErroAplicacao, arquivoContabilSpe } from '@norteia/aplicacao'
import { exigirContexto, temPapel } from '@/lib/contexto'

/** Lançamentos contábeis da SPE no período, no formato configurado pelo cliente. */
export async function GET(requisicao: Request, { params }: { params: Promise<{ speId: string }> }) {
  const { speId } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador'))
    return new Response('Sem permissão.', { status: 403 })
  const q = new URL(requisicao.url).searchParams
  try {
    const arq = await arquivoContabilSpe(
      ctx.db,
      ctx.tenant.id,
      speId,
      q.get('inicio') ?? '',
      q.get('fim') ?? '',
    )
    return new Response(arq.conteudo, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${arq.nome}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    if (e instanceof ErroAplicacao) return new Response(e.message, { status: 422 })
    throw e
  }
}
