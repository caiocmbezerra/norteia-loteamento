import type { Metadata } from 'next'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { cn } from '@/lib/utils'
import { AlternarCentro, FormularioCentro } from './formulario'

export const metadata: Metadata = { title: 'Centros de custo' }

export default async function CentrosCusto() {
  const ctx = await exigirContexto()
  const { data: centros } = await ctx.db
    .from('centros_custo')
    .select('codigo, nome, ordem, ativo')
    .eq('tenant_id', ctx.tenant.id)
    .order('ordem')
    .order('codigo')
  const podeEditar = temPapel(ctx, 'dono', 'financeiro', 'engenharia')
  const lista = centros ?? []
  return (
    <>
      <TituloPagina
        titulo="Centros de custo"
        subtitulo="O plano de custos da loteadora. Os padrões de loteamento já vêm criados; acrescente os seus. Centro desativado sai das listas de lançamento, mas o histórico continua."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Cartao>
          <ul className="divide-y">
            {lista.map((c) => {
              const sub = c.codigo.includes('.')
              return (
                <li
                  key={c.codigo}
                  className={cn(
                    'flex items-center justify-between gap-2 py-2 text-sm',
                    sub && 'pl-5',
                  )}
                >
                  <span className={cn(!c.ativo && 'text-muted-foreground line-through')}>
                    {c.nome}
                    {!c.ativo && <span className="sr-only"> (desativado)</span>}
                  </span>
                  {podeEditar && <AlternarCentro codigo={c.codigo} nome={c.nome} ativo={c.ativo} />}
                </li>
              )
            })}
          </ul>
        </Cartao>
        {podeEditar && (
          <Cartao className="flex h-fit flex-col gap-3">
            <h2 className="font-semibold">Novo centro de custo</h2>
            <FormularioCentro raizes={lista.filter((c) => !c.codigo.includes('.') && c.ativo)} />
          </Cartao>
        )}
      </div>
    </>
  )
}
