import type { Metadata } from 'next'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto } from '@/lib/contexto'
import { mesAtualSaoPaulo } from '@/lib/datas'
import { FormularioNovo } from './formulario-novo'

export const metadata: Metadata = { title: 'Novo empreendimento' }

export default async function PaginaNovoEmpreendimento() {
  const ctx = await exigirContexto()
  const { data: spes } = await ctx.db
    .from('spes')
    .select('id, razao_social')
    .eq('tenant_id', ctx.tenant.id)
    .order('criado_em')
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <TituloPagina
        titulo="Novo empreendimento"
        subtitulo="Quadras e lotes são gerados em grade; ajuste cada lote depois."
      />
      <Cartao>
        <FormularioNovo mesPadrao={mesAtualSaoPaulo()} spes={spes ?? []} />
      </Cartao>
    </div>
  )
}
