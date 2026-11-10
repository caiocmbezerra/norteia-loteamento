import { CATEGORIAS_CHAMADO, SITUACOES_CHAMADO, carregarChamado } from '@norteia/aplicacao'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ConversaChamado } from '@/components/conversa-chamado'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { responderAtendimento } from '../acoes'
import { BotaoSituacao } from '../botao-situacao'

export const metadata: Metadata = { title: 'Chamado' }

export default async function PaginaChamado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await exigirContexto()
  const ch = await carregarChamado(ctx.db, id)
  if (!ch) notFound()
  const { data: contrato } = await ctx.db
    .from('contratos')
    .select('id, empreendimento_id, compradores(nome), lotes(numero, quadras(codigo))')
    .eq('id', ch.contratoId)
    .maybeSingle()
  const podeResponder = temPapel(ctx, 'dono', 'financeiro', 'comercial_gestor')
  return (
    <>
      <Link href="/atendimento" className="text-sm text-muted-foreground hover:underline">
        ← Atendimento
      </Link>
      <TituloPagina
        titulo={ch.assunto}
        subtitulo={`${contrato?.compradores?.nome ?? ''} · Quadra ${contrato?.lotes?.quadras?.codigo ?? '?'} · Lote ${contrato?.lotes?.numero ?? '?'} · ${CATEGORIAS_CHAMADO[ch.categoria]} · ${SITUACOES_CHAMADO[ch.situacao]}`}
        acoes={
          <>
            {contrato && (
              <Link
                href={`/empreendimentos/${contrato.empreendimento_id}/carteira/${contrato.id}`}
                className="text-sm text-primary underline underline-offset-4"
              >
                Ver contrato
              </Link>
            )}
            {podeResponder && (
              <BotaoSituacao chamadoId={ch.id} resolvido={ch.situacao === 'resolvido'} />
            )}
          </>
        }
      />
      <Cartao>
        {podeResponder ? (
          <ConversaChamado
            mensagens={ch.mensagens}
            souComprador={false}
            nomeLoteadora={ctx.tenant.nome}
            acao={responderAtendimento.bind(null, ch.id)}
          />
        ) : (
          <ol className="flex flex-col gap-3 text-sm" aria-label="Mensagens">
            {ch.mensagens.map((m) => (
              <li key={m.id} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  {m.autorComprador ? 'Comprador' : ctx.tenant.nome}
                </p>
                <p className="whitespace-pre-wrap">{m.texto}</p>
              </li>
            ))}
          </ol>
        )}
      </Cartao>
    </>
  )
}
