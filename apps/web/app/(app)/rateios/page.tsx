import { formatarData, formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { FormularioRateio } from './formulario'

export const metadata: Metadata = { title: 'Rateio de despesas' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const CRITERIO: Record<string, string> = {
  lotes: 'por número de lotes',
  area: 'por área',
  vgv: 'por VGV de tabela',
  manual: 'por percentuais informados',
}

export default async function PaginaRateios() {
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'engenharia')) redirect('/painel')
  const [{ data: empreendimentos }, { data: centros }, { data: fornecedores }, { data: rateios }] =
    await Promise.all([
      ctx.db
        .from('empreendimentos')
        .select('id, nome')
        .eq('tenant_id', ctx.tenant.id)
        .order('nome'),
      ctx.db
        .from('centros_custo')
        .select('codigo, nome')
        .eq('tenant_id', ctx.tenant.id)
        .order('ordem'),
      ctx.db.from('fornecedores').select('id, nome').eq('tenant_id', ctx.tenant.id).order('nome'),
      ctx.db
        .from('rateios')
        .select(
          'id, descricao, valor_centavos, vencimento, criterio, criado_em, contas_pagar(id, valor_centavos, empreendimentos(nome))',
        )
        .eq('tenant_id', ctx.tenant.id)
        .order('criado_em', { ascending: false })
        .limit(50),
    ])

  return (
    <>
      <TituloPagina
        titulo="Rateio de despesas comuns"
        subtitulo="Uma despesa de vários empreendimentos (contabilidade, escritório, licenças) vira uma conta a pagar em cada um, na proporção escolhida. Os centavos fecham com o total."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Nova despesa rateada</h2>
          <FormularioRateio
            empreendimentos={empreendimentos ?? []}
            centros={centros ?? []}
            fornecedores={fornecedores ?? []}
            hoje={hojeSaoPaulo()}
          />
        </Cartao>
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Rateios recentes</h2>
          {(rateios ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum rateio ainda.</p>
          )}
          <ul className="divide-y">
            {(rateios ?? []).map((r) => (
              <li key={r.id} className="flex flex-col gap-1 py-3 text-sm">
                <span className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{r.descricao}</span>
                  <span>{moeda(r.valor_centavos)}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {CRITERIO[r.criterio]} · vence {formatarData(r.vencimento)}
                </span>
                <ul className="text-xs">
                  {r.contas_pagar.map((c) => (
                    <li key={c.id} className="flex justify-between gap-2">
                      <span>{c.empreendimentos?.nome}</span>
                      <span>{moeda(c.valor_centavos)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </>
  )
}
