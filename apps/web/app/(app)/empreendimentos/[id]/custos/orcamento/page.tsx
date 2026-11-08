import { formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { revisarOrcamento } from '../acoes'
import { FormularioItemOrcamento } from '../formularios'

export const metadata: Metadata = { title: 'Orçamento' }

const texto = (c: number) => formatarMoeda(arredondarCentavos(String(c))).replace(/^R\$\s/, '')

export default async function PaginaOrcamento({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await exigirContexto()
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  const [{ data: itens }, { data: centros }, { count: planos }] = await Promise.all([
    ctx.db
      .from('orcamento_itens')
      .select('id, centro_codigo, descricao, tipo, valor_centavos, mes_inicio, mes_fim')
      .eq('empreendimento_id', id)
      .order('mes_inicio'),
    ctx.db
      .from('centros_custo')
      .select('codigo, nome')
      .eq('tenant_id', ctx.tenant.id)
      .eq('ativo', true)
      .order('ordem'),
    ctx.db
      .from('plano_versoes')
      .select('id', { count: 'exact', head: true })
      .eq('empreendimento_id', id),
  ])
  const podeEditar = temPapel(ctx, 'dono', 'financeiro', 'engenharia')
  const opcoes = (centros ?? []).map((c) => ({ valor: c.codigo, rotulo: c.nome }))
  const total = (itens ?? []).reduce(
    (s, i) => s + i.valor_centavos * (i.tipo === 'mensal' ? i.mes_fim - i.mes_inicio + 1 : 1),
    0,
  )

  return (
    <>
      <Link
        href={`/empreendimentos/${id}/custos`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Custos e obra · {e.nome}
      </Link>
      <TituloPagina
        titulo="Orçamento revisado"
        subtitulo={`Total: ${formatarMoeda(arredondarCentavos(String(total)))}. O orçamento original fica congelado no plano aprovado.`}
      />
      {(itens ?? []).length === 0 && (
        <Alerta tipo="aviso">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Ainda não há orçamento revisado: os custos do plano aprovado estão sendo usados.
            </span>
            {podeEditar && (planos ?? 0) > 0 && (
              <form action={revisarOrcamento.bind(null, id)}>
                <Button size="sm" type="submit">
                  Copiar do plano
                </Button>
              </form>
            )}
          </div>
        </Alerta>
      )}
      <Cartao className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Meses contados a partir do mês 0 do empreendimento. Gastos de subcentros (ex.: Drenagem)
          consomem o orçamento do centro acima (Infraestrutura) quando o subcentro não está orçado.
        </p>
        {podeEditar ? (
          <>
            {(itens ?? []).map((i) => (
              <FormularioItemOrcamento
                key={i.id}
                empreendimentoId={id}
                centros={opcoes}
                item={{
                  id: i.id,
                  centro: i.centro_codigo,
                  descricao: i.descricao,
                  tipo: i.tipo,
                  valor: texto(i.valor_centavos),
                  mesInicio: i.mes_inicio,
                  mesFim: i.mes_fim,
                }}
              />
            ))}
            <div className="border-t pt-4">
              <FormularioItemOrcamento empreendimentoId={id} centros={opcoes} />
            </div>
          </>
        ) : (
          <ul className="divide-y text-sm">
            {(itens ?? []).map((i) => (
              <li key={i.id} className="flex justify-between py-2">
                <span>{i.descricao}</span>
                <span>{formatarMoeda(arredondarCentavos(String(i.valor_centavos)))}</span>
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  )
}
