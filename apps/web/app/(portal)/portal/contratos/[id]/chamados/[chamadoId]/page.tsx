import { CATEGORIAS_CHAMADO, SITUACOES_CHAMADO, carregarChamado } from '@norteia/aplicacao'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConversaChamado } from '@/components/conversa-chamado'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirUsuario } from '@/lib/contexto'
import { responderChamadoPortal } from '../acoes'

export const metadata: Metadata = { title: 'Chamado' }

export default async function PaginaChamadoPortal({
  params,
}: {
  params: Promise<{ id: string; chamadoId: string }>
}) {
  const { id, chamadoId } = await params
  const { db } = await exigirUsuario()
  const ch = await carregarChamado(db, chamadoId)
  if (!ch || ch.contratoId !== id) notFound()
  return (
    <>
      <Link
        href={`/portal/contratos/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Meu contrato
      </Link>
      <TituloPagina
        titulo={ch.assunto}
        subtitulo={`${CATEGORIAS_CHAMADO[ch.categoria]} · ${SITUACOES_CHAMADO[ch.situacao]}`}
      />
      <Cartao>
        <ConversaChamado
          mensagens={ch.mensagens}
          souComprador
          nomeLoteadora="Loteadora"
          acao={responderChamadoPortal.bind(null, id, chamadoId)}
        />
      </Cartao>
    </>
  )
}
