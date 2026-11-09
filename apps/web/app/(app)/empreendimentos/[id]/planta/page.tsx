import type { StatusLote } from '@norteia/dominio'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { EditorPlanta, EnvioPlanta } from './editor-planta'

export const metadata: Metadata = { title: 'Planta de lotes' }

const ordenarCodigo = (a: string, b: string) =>
  a.length - b.length || a.localeCompare(b, 'pt-BR', { numeric: true })

export default async function PaginaPlanta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'engenharia', 'comercial_gestor')) redirect(`/empreendimentos/${id}`)
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome, planta_arquivo, planta_largura, planta_altura')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  const [{ data: quadras, error }, assinada] = await Promise.all([
    ctx.db
      .from('quadras')
      .select('codigo, lotes(id, numero, status, planta_poligono)')
      .eq('empreendimento_id', id),
    e.planta_arquivo
      ? ctx.db.storage.from('plantas').createSignedUrl(e.planta_arquivo, 3600)
      : Promise.resolve(null),
  ])
  if (error) throw error
  const lotes = (quadras ?? [])
    .sort((a, b) => ordenarCodigo(a.codigo, b.codigo))
    .flatMap((q) =>
      q.lotes
        .sort((a, b) => ordenarCodigo(a.numero, b.numero))
        .map((l) => ({
          id: l.id,
          rotulo: `Quadra ${q.codigo} · Lote ${l.numero}`,
          status: l.status as StatusLote,
          pontos: (l.planta_poligono as [number, number][] | null) ?? null,
        })),
    )
  const url = assinada?.data?.signedUrl

  return (
    <>
      <Link
        href={`/empreendimentos/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {e.nome}
      </Link>
      <TituloPagina
        titulo="Planta de lotes"
        subtitulo="Envie a planta do loteamento e desenhe o contorno de cada lote por cima. O mapa do empreendimento passa a mostrar a planta com as cores da situação."
      />
      <Cartao>
        <EnvioPlanta empreendimentoId={id} temPlanta={!!e.planta_arquivo} />
      </Cartao>
      {url && e.planta_largura && e.planta_altura && (
        <Cartao>
          <EditorPlanta
            key={e.planta_arquivo}
            empreendimentoId={id}
            url={url}
            largura={e.planta_largura}
            altura={e.planta_altura}
            lotes={lotes}
          />
        </Cartao>
      )}
    </>
  )
}
