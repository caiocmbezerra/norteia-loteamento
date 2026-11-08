import { ErroAplicacao, gerarInforme } from '@norteia/aplicacao'
import { exigirUsuario } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

/** Informe de pagamentos do ano (IR) baixado pelo próprio comprador. */
export async function GET(requisicao: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { db } = await exigirUsuario()
  const ano = Number(new URL(requisicao.url).searchParams.get('ano'))
  try {
    const informe = await gerarInforme(db, id, ano, hojeSaoPaulo())
    if (!informe) return new Response('Contrato não encontrado.', { status: 404 })
    return new Response(Buffer.from(informe.conteudo), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${informe.nomeArquivo}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    if (e instanceof ErroAplicacao) return new Response(e.message, { status: 422 })
    throw e
  }
}
