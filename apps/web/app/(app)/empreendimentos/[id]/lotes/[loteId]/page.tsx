import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SeloStatus } from '@/components/status-lote'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto } from '@/lib/contexto'
import { FormularioLote } from './formulario-lote'

export const metadata: Metadata = { title: 'Lote' }

export default async function PaginaLote({
  params,
}: {
  params: Promise<{ id: string; loteId: string }>
}) {
  const { id, loteId } = await params
  const ctx = await exigirContexto()
  const { data: lote } = await ctx.db
    .from('lotes')
    .select(
      'id, numero, status, area_m2, testada_m, preco_base_centavos, observacao, quadras(codigo), empreendimentos(nome)',
    )
    .eq('id', loteId)
    .eq('empreendimento_id', id)
    .maybeSingle()
  if (!lote) notFound()
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Link
        href={`/empreendimentos/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {lote.empreendimentos?.nome}
      </Link>
      <TituloPagina
        titulo={`Quadra ${lote.quadras?.codigo} · Lote ${lote.numero}`}
        acoes={<SeloStatus status={lote.status} />}
      />
      <Cartao>
        <FormularioLote empreendimentoId={id} lote={lote} />
      </Cartao>
    </div>
  )
}
