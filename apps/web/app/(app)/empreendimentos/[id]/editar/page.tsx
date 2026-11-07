import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto } from '@/lib/contexto'
import { FormularioEditar } from './formulario-editar'

export const metadata: Metadata = { title: 'Editar empreendimento' }

export default async function PaginaEditar({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await exigirContexto()
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select(
      'id, nome, municipio, uf, situacao, data_registro, registro_matricula, area_total_m2, area_vendavel_m2',
    )
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <TituloPagina titulo="Editar empreendimento" subtitulo={e.nome} />
      <Cartao>
        <FormularioEditar e={e} />
      </Cartao>
    </div>
  )
}
