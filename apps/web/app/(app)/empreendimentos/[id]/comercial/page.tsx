import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { Decimal, arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { DecisaoDesconto } from './decisao-desconto'

export const metadata: Metadata = { title: 'Comercial' }

const moeda = (c: number | Decimal) =>
  formatarMoeda(arredondarCentavos(c instanceof Decimal ? c : String(c)))
const quando = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
})

export default async function PaginaComercial({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await exigirContexto()
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  const corretor = !temPapel(
    ctx,
    'dono',
    'comercial_gestor',
    'financeiro',
    'contador',
    'engenharia',
    'socio_leitura',
  )

  const [{ data: vendas }, { data: reservas }, { data: lotes }, { data: pedidos }] =
    await Promise.all([
      ctx.db
        .from('vendas')
        .select(
          'id, data_venda, preco_centavos, comissao_percentual, comissao_modo, lote_id, lotes(numero, quadras(codigo)), corretores(nome)',
        )
        .eq('empreendimento_id', id)
        .eq('situacao', 'ativa')
        .order('data_venda', { ascending: false }),
      ctx.db
        .from('reservas')
        .select(
          'id, cliente_nome, expira_em, lote_id, lotes(numero, quadras(codigo)), corretores(nome)',
        )
        .eq('empreendimento_id', id)
        .eq('situacao', 'ativa')
        .gt('expira_em', new Date().toISOString())
        .order('expira_em'),
      ctx.db.from('lotes').select('status, preco_base_centavos').eq('empreendimento_id', id),
      ctx.db
        .from('aprovacoes_desconto')
        .select(
          'id, situacao, preco_tabela_centavos, preco_centavos, desconto, limite, justificativa, valida_ate, criado_em, lote_id, lotes(numero, quadras(codigo))',
        )
        .eq('empreendimento_id', id)
        .in('situacao', ['pendente', 'aprovada'])
        .order('criado_em'),
    ])
  const podeAprovar = temPapel(ctx, 'dono')

  const lista = vendas ?? []
  const vgvVendido = lista.reduce((s, v) => s.plus(v.preco_centavos), new Decimal(0))
  const estoque = (lotes ?? []).filter((l) => ['disponivel', 'reservado'].includes(l.status))
  const vgvEstoque = estoque.reduce((s, l) => s.plus(l.preco_base_centavos ?? 0), new Decimal(0))
  const porCorretor = new Map<string, { vendas: number; comissao: Decimal }>()
  for (const v of lista) {
    const nome = v.corretores?.nome ?? 'Sem corretor'
    const c = porCorretor.get(nome) ?? { vendas: 0, comissao: new Decimal(0) }
    c.vendas++
    c.comissao = c.comissao.plus(new Decimal(v.preco_centavos).times(String(v.comissao_percentual)))
    porCorretor.set(nome, c)
  }
  const nomeLote = (l: { numero: string; quadras: { codigo: string } | null } | null) =>
    l ? `Quadra ${l.quadras?.codigo} · Lote ${l.numero}` : '—'

  return (
    <>
      <Link
        href={`/empreendimentos/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {e.nome}
      </Link>
      <TituloPagina
        titulo="Comercial"
        subtitulo={corretor ? 'Suas reservas e vendas.' : 'Reservas, vendas e comissões.'}
        {...(!corretor
          ? {
              acoes: (
                <Button asChild variant="secondary">
                  <Link href={`/empreendimentos/${id}/comercial/precos`}>Tabela de preços</Link>
                </Button>
              ),
            }
          : {})}
      />

      {(pedidos ?? []).length > 0 && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Descontos acima do limite</h2>
          <ul className="divide-y">
            {(pedidos ?? []).map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 text-sm">
                <span>
                  <Link
                    href={`/empreendimentos/${id}/lotes/${p.lote_id}`}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    {nomeLote(p.lotes)}
                  </Link>{' '}
                  · {moeda(p.preco_centavos)} sobre tabela de {moeda(p.preco_tabela_centavos)} ·
                  desconto de {formatarPercentual(String(p.desconto), 2)} (limite{' '}
                  {formatarPercentual(String(p.limite), 2)})
                </span>
                <span className="text-muted-foreground">“{p.justificativa}”</span>
                {p.situacao === 'aprovada' ? (
                  <span className="text-xs text-muted-foreground">
                    Aprovado; vale para venda até {formatarData(p.valida_ate!)}.
                  </span>
                ) : podeAprovar ? (
                  <DecisaoDesconto
                    empreendimentoId={id}
                    aprovacaoId={p.id}
                    rotulo={nomeLote(p.lotes)}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">Aguardando o dono.</span>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <section aria-label="Resumo comercial" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Lotes vendidos" valor={String(lista.length)} />
        <Indicador
          rotulo="VGV vendido"
          valor={moeda(vgvVendido)}
          nota="valor comercial — não é caixa"
        />
        <Indicador rotulo="Reservas ativas" valor={String((reservas ?? []).length)} />
        <Indicador
          rotulo="Estoque à venda (tabela)"
          valor={moeda(vgvEstoque)}
          nota={`${estoque.length} lotes`}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Reservas ativas</h2>
          {(reservas ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma reserva ativa.</p>
          )}
          <ul className="divide-y">
            {(reservas ?? []).map((r) => (
              <li key={r.id} className="py-3 text-sm">
                <Link
                  href={`/empreendimentos/${id}/lotes/${r.lote_id}`}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {nomeLote(r.lotes)}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {r.cliente_nome} · {r.corretores?.nome ?? 'sem corretor'} · até{' '}
                  {quando.format(new Date(r.expira_em))}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>

        {!corretor && (
          <Cartao className="flex flex-col gap-3">
            <h2 className="font-semibold">Comissões por corretor</h2>
            {porCorretor.size === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma venda ainda.</p>
            )}
            <table className="w-full text-sm">
              <tbody>
                {[...porCorretor.entries()].map(([nome, c]) => (
                  <tr key={nome} className="border-t first:border-t-0">
                    <td className="py-2">{nome}</td>
                    <td className="py-2 text-right text-muted-foreground">{c.vendas} venda(s)</td>
                    <td className="py-2 text-right font-medium">{moeda(c.comissao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Cartao>
        )}
      </div>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Vendas</h2>
        {lista.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma venda registrada.</p>
        )}
        <ul className="divide-y">
          {lista.map((v) => (
            <li
              key={v.id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-3 text-sm"
            >
              <span>
                <Link
                  href={`/empreendimentos/${id}/lotes/${v.lote_id}`}
                  className="font-medium text-primary underline underline-offset-4"
                >
                  {nomeLote(v.lotes)}
                </Link>
                <span className="text-muted-foreground">
                  {' '}
                  · {formatarData(v.data_venda)} · {v.corretores?.nome ?? 'sem corretor'} · comissão{' '}
                  {formatarPercentual(String(v.comissao_percentual), 1)}{' '}
                  {v.comissao_modo === 'ato' ? 'no ato' : 'sobre o recebido'}
                </span>
              </span>
              <span className="font-medium">{moeda(v.preco_centavos)}</span>
            </li>
          ))}
        </ul>
      </Cartao>
      {corretor && (
        <Alerta tipo="aviso">Valores do empreendimento são visíveis para a gestão.</Alerta>
      )}
    </>
  )
}
