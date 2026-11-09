import { NextResponse } from 'next/server'
import { exigirContexto } from '@/lib/contexto'

/** Abre o anexo da conta por um link assinado curto (a RLS decide quem pode). */
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string; anexoId: string }> },
) {
  const { id, anexoId } = await params
  const ctx = await exigirContexto()
  const { data: anexo } = await ctx.db
    .from('anexos_conta')
    .select('caminho, nome')
    .eq('id', anexoId)
    .eq('empreendimento_id', id)
    .maybeSingle()
  if (!anexo) return new NextResponse('Anexo não encontrado.', { status: 404 })
  const { data, error } = await ctx.db.storage
    .from('documentos')
    .createSignedUrl(anexo.caminho, 60, { download: anexo.nome })
  if (error || !data) return new NextResponse('Não foi possível abrir o anexo.', { status: 502 })
  return NextResponse.redirect(data.signedUrl)
}
