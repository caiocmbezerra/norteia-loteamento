import {
  ErroAplicacao,
  TIPOS_DOCUMENTO,
  type TipoDocumento,
  gerarDocumento,
  gerarInforme,
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
  const q = new URL(requisicao.url).searchParams
  const aditivo = q.get('aditivo') ?? undefined
  try {
    if (tipo === 'informe_pagamentos') {
      const informe = await gerarInforme(ctx.db, contratoId, Number(q.get('ano')), hojeSaoPaulo())
      if (!informe) return new Response('Contrato não encontrado.', { status: 404 })
      return new Response(Buffer.from(informe.conteudo), {
        headers: {
          'Content-Type': DOCX,
          'Content-Disposition': `attachment; filename="${informe.nomeArquivo}"`,
          'Cache-Control': 'no-store',
        },
      })
    }
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
