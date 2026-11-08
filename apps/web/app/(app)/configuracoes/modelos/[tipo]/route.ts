import { TIPOS_DOCUMENTO, type TipoDocumento, modeloEmUso } from '@norteia/aplicacao'
import { exigirContexto } from '@/lib/contexto'

/** Baixa o modelo em uso (do cliente ou padrão) para editar no Word. */
export async function GET(_: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params
  const ctx = await exigirContexto()
  if (!(TIPOS_DOCUMENTO as readonly string[]).includes(tipo))
    return new Response('Modelo desconhecido.', { status: 404 })
  const m = await modeloEmUso(ctx.db, ctx.tenant.id, tipo as TipoDocumento)
  return new Response(Buffer.from(m.conteudo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${m.nomeArquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
