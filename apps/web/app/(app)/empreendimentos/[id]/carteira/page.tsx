import { carregarCarteira, simularCessao } from '@norteia/aplicacao'
import { formatarData, formatarMoeda } from '@norteia/dominio'
import { Decimal, arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { FormularioGerarContrato } from './formularios'

export const metadata: Metadata = { title: 'Carteira' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))

export default async function PaginaCarteira({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ taxa?: string; perda?: string }>
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams])
  const ctx = await exigirContexto()
  if (
    !temPapel(
      ctx,
      'dono',
      'financeiro',
      'contador',
      'comercial_gestor',
      'engenharia',
      'socio_leitura',
    )
  )
    redirect(`/empreendimentos/${id}`)
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  const hoje = hojeSaoPaulo()
  const [painel, ...ultimos] = await Promise.all([
    carregarCarteira(ctx.db, id, hoje),
    ...['IPCA', 'IGP-M', 'INCC'].map((codigo) =>
      ctx.db
        .from('indice_valores')
        .select('competencia')
        .eq('codigo', codigo)
        .order('competencia', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
  ])
  const indices = ['IPCA', 'IGP-M', 'INCC'].map((codigo, i) => {
    const c = ultimos[i]?.data?.competencia
    return `${codigo} ${c ? formatarData(c).slice(3) : 'sem dados'}`
  })
  const podeGerar = temPapel(ctx, 'dono', 'financeiro', 'comercial_gestor')
  const pct = (v: string | undefined) =>
    v && /^\d{1,2}(,\d{1,4})?$/.test(v)
      ? new Decimal(v.replace(',', '.')).div(100).toString()
      : null
  const taxa = pct(busca.taxa)
  const perda = pct(busca.perda ?? '0')
  const cessao = taxa && perda ? await simularCessao(ctx.db, id, hoje, taxa, perda) : null
  const t = painel.totais

  return (
    <>
      <Link
        href={`/empreendimentos/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {e.nome}
      </Link>
      <TituloPagina
        titulo="Carteira"
        subtitulo="Contratos, parcelas a receber e inadimplência."
        acoes={
          temPapel(ctx, 'dono', 'comercial_gestor') && (
            <Link
              href={`/empreendimentos/${id}/carteira/importar`}
              className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
            >
              Importar carteira
            </Link>
          )
        }
      />
      <p className="text-xs text-muted-foreground">
        Últimos índices publicados (BCB): {indices.join(' · ')}. Reajustes aplicados diariamente.
      </p>

      <section aria-label="Resumo da carteira" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Saldo a receber"
          valor={moeda(t.saldoCentavos)}
          nota="principal + juros do plano"
        />
        <Indicador
          rotulo="Vencido"
          valor={moeda(t.vencidoCentavos)}
          nota={`${t.contratosInadimplentes} contrato(s) em atraso`}
        />
        <Indicador rotulo="Recebido no mês" valor={moeda(t.recebidoNoMesCentavos)} />
        <Indicador
          rotulo="Atraso"
          valor={`${t.faixas.ate30} · ${t.faixas.ate90} · ${t.faixas.acima90}`}
          nota="até 30 · 31–90 · mais de 90 dias"
        />
      </section>

      {painel.vendasSemContrato.length > 0 && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Vendas sem contrato</h2>
          <p className="text-sm text-muted-foreground">
            Enquanto o contrato não é gerado, o fluxo usa a tabela da venda.
          </p>
          <ul className="divide-y">
            {painel.vendasSemContrato.map((v) => (
              <li
                key={v.vendaId}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <span>
                  <Link
                    href={`/empreendimentos/${id}/lotes/${v.loteId}`}
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    {v.lote}
                  </Link>
                  <span className="text-muted-foreground">
                    {' '}
                    · venda em {formatarData(v.dataVenda)}
                  </span>
                </span>
                {podeGerar && <FormularioGerarContrato empreendimentoId={id} vendaId={v.vendaId} />}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Contratos</h2>
        {painel.contratos.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum contrato ainda.</p>
        )}
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-normal">Lote</th>
                <th className="py-2 font-normal">Comprador</th>
                <th className="py-2 text-right font-normal">Saldo</th>
                <th className="py-2 text-right font-normal">Vencido</th>
                <th className="py-2 text-right font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {painel.contratos.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">
                    <Link
                      href={`/empreendimentos/${id}/carteira/${c.id}`}
                      className="font-medium text-primary underline underline-offset-4"
                    >
                      {c.lote}
                    </Link>
                  </td>
                  <td className="py-2">{c.comprador ?? '—'}</td>
                  <td className="py-2 text-right">{moeda(c.saldoCentavos)}</td>
                  <td className="py-2 text-right">
                    {c.vencidoCentavos > 0 ? moeda(c.vencidoCentavos) : '—'}
                  </td>
                  <td className="py-2 text-right">
                    {c.situacao === 'quitado' ? (
                      'Quitado'
                    ) : c.situacao === 'distratado' ? (
                      'Distratado'
                    ) : c.situacao === 'cedido' ? (
                      'Cedido'
                    ) : c.maiorAtraso > 0 ? (
                      <span className="font-medium text-destructive">
                        {c.parcelasVencidas} em atraso · {c.maiorAtraso} dias
                      </span>
                    ) : c.proximoVencimento ? (
                      `Em dia · próxima ${formatarData(c.proximoVencimento)}`
                    ) : (
                      'Em dia'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Simular cessão da carteira</h2>
        <p className="text-sm text-muted-foreground">
          Quanto o fundo ou banco pagaria hoje pelas parcelas em aberto, à taxa de desconto dele e
          com a perda esperada.
        </p>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1 text-sm">
            Taxa de desconto (% ao mês)
            <input
              name="taxa"
              inputMode="decimal"
              defaultValue={busca.taxa ?? '1,5'}
              className="h-10 w-32 rounded-md border bg-background px-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Perda esperada (%)
            <input
              name="perda"
              inputMode="decimal"
              defaultValue={busca.perda ?? '5'}
              className="h-10 w-32 rounded-md border bg-background px-3"
            />
          </label>
          <button type="submit" className="h-10 rounded-md border px-4 text-sm hover:bg-muted">
            Simular
          </button>
        </form>
        {cessao && (
          <section aria-label="Resultado da cessão" className="grid grid-cols-3 gap-3">
            <Indicador
              rotulo="Carteira nominal"
              valor={moeda(cessao.nominalCentavos)}
              nota={`${cessao.parcelas} parcelas`}
            />
            <Indicador rotulo="Valor da cessão" valor={moeda(cessao.presenteCentavos)} />
            <Indicador rotulo="Deságio" valor={moeda(cessao.desagioCentavos)} />
          </section>
        )}
      </Cartao>
    </>
  )
}
