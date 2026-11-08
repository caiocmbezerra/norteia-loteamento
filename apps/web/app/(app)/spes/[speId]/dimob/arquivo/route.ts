import { ErroAplicacao, arquivoDimob } from '@norteia/aplicacao'
import { exigirContexto, temPapel } from '@/lib/contexto'

/** Arquivo de importação da DIMOB para o programa da Receita (PGD Dimob). */
export async function GET(requisicao: Request, { params }: { params: Promise<{ speId: string }> }) {
  const { speId } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador'))
    return new Response('Sem permissão.', { status: 403 })
  const q = new URL(requisicao.url).searchParams
  const ano = Number(q.get('ano'))
  const retificadora = q.get('retificadora') === '1'
  try {
    const arq = await arquivoDimob(ctx.db, speId, ano, {
      retificadora,
      recibo: retificadora ? (q.get('recibo') ?? '').replace(/\D/g, '') || null : null,
    })
    return new Response(arq.conteudo, {
      headers: {
        'Content-Type': 'text/plain; charset=us-ascii',
        'Content-Disposition': `attachment; filename="${arq.nome}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    if (e instanceof ErroAplicacao) return new Response(e.message, { status: 422 })
    throw e
  }
}
