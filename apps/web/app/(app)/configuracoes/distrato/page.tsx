import { formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { cn } from '@/lib/utils'
import { AlternarItem, FormularioItem } from './formulario'

export const metadata: Metadata = { title: 'Distrato' }

export default async function ConfiguracaoDistrato() {
  const ctx = await exigirContexto()
  const { data: itens } = await ctx.db
    .from('itens_desconto_distrato')
    .select('id, nome, dentro_do_limite, valor_padrao_centavos, ativo')
    .eq('tenant_id', ctx.tenant.id)
    .order('nome')
  const podeEditar = temPapel(ctx, 'dono', 'financeiro')
  return (
    <>
      <TituloPagina
        titulo="Distrato"
        subtitulo="Custos que a sua loteadora desconta no distrato, além da cláusula penal, da fruição, dos encargos e da comissão. Confirme cada item com o seu advogado."
      />
      <p className="text-sm text-muted-foreground">
        Percentuais (cláusula penal, teto de 10%, fruição, parcelas da devolução) ficam em{' '}
        <Link
          href="/configuracoes/parametros"
          className="text-primary underline underline-offset-4"
        >
          Parâmetros
        </Link>
        .
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <Cartao>
          {(itens ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum custo cadastrado.</p>
          )}
          <ul className="divide-y">
            {(itens ?? []).map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-3 text-sm">
                <span className={cn(!i.ativo && 'text-muted-foreground line-through')}>
                  <span className="font-medium">{i.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {i.dentro_do_limite ? 'Dentro do teto' : 'Fora do teto'}
                    {i.valor_padrao_centavos !== null &&
                      ` · sugerido ${formatarMoeda(arredondarCentavos(String(i.valor_padrao_centavos)))}`}
                    {!i.ativo && ' · desativado'}
                  </span>
                </span>
                {podeEditar && <AlternarItem id={i.id} nome={i.nome} ativo={i.ativo} />}
              </li>
            ))}
          </ul>
        </Cartao>
        {podeEditar && (
          <Cartao className="flex h-fit flex-col gap-3">
            <h2 className="font-semibold">Novo custo</h2>
            <FormularioItem />
          </Cartao>
        )}
      </div>
    </>
  )
}
