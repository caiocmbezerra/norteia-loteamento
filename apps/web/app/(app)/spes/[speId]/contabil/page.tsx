import { carregarContabilSpe } from '@norteia/aplicacao'
import { formatarData, formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Cartao, TituloPagina } from '@/components/ui/cartao'
import { Alerta, Campo, Entrada } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'

export const metadata: Metadata = { title: 'Contábil da SPE' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const DATA = /^\d{4}-\d{2}-\d{2}$/
const NOMES_MES = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]
const mesExtenso = (m: string) => `${NOMES_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`

export default async function PaginaContabilSpe({
  params,
  searchParams,
}: {
  params: Promise<{ speId: string }>
  searchParams: Promise<{ inicio?: string; fim?: string }>
}) {
  const { speId } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador')) redirect('/painel')
  const hoje = hojeSaoPaulo()
  const q = await searchParams
  const inicio = q.inicio && DATA.test(q.inicio) ? q.inicio : `${hoje.slice(0, 4)}-01-01`
  const fim = q.fim && DATA.test(q.fim) ? q.fim : hoje
  const d = await carregarContabilSpe(ctx.db, ctx.tenant.id, speId, inicio, fim)
  if (!d) notFound()
  const soma = (
    k:
      | 'receitaCompetenciaCentavos'
      | 'receitaCaixaCentavos'
      | 'custoCompetenciaCentavos'
      | 'custoCaixaCentavos'
      | 'resultadoCompetenciaCentavos'
      | 'resultadoCaixaCentavos',
  ) => d.mensal.reduce((t, m) => t + m[k], 0)

  return (
    <>
      <Link href={`/spes/${speId}`} className="text-sm text-muted-foreground hover:underline">
        ← SPE
      </Link>
      <TituloPagina
        titulo="Contábil"
        subtitulo="Caixa × competência e lançamentos para o contador, a partir dos fatos registrados."
      />
      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Campo id="inicio" rotulo="De">
          <Entrada id="inicio" name="inicio" type="date" defaultValue={inicio} />
        </Campo>
        <Campo id="fim" rotulo="Até">
          <Entrada id="fim" name="fim" type="date" defaultValue={fim} />
        </Campo>
        <Button type="submit" variant="outline">
          Ver período
        </Button>
      </form>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Caixa × competência</h2>
        <p className="text-xs text-muted-foreground">
          Competência: vendas contratadas menos distratos e custos pelo vencimento. Caixa:
          recebimentos menos devoluções e custos pagos. Visão gerencial; o tratamento fiscal é do
          contador.
        </p>
        {d.mensal.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum fato no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Caixa por competência">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Mês</th>
                  <th className="py-2 text-right font-normal">Receita competência</th>
                  <th className="py-2 text-right font-normal">Receita caixa</th>
                  <th className="py-2 text-right font-normal">Custo competência</th>
                  <th className="py-2 text-right font-normal">Custo caixa</th>
                  <th className="py-2 text-right font-normal">Resultado competência</th>
                  <th className="py-2 text-right font-normal">Resultado caixa</th>
                </tr>
              </thead>
              <tbody>
                {d.mensal.map((m) => (
                  <tr key={m.mes} className="border-t">
                    <td className="py-2">{mesExtenso(m.mes)}</td>
                    <td className="py-2 text-right">{moeda(m.receitaCompetenciaCentavos)}</td>
                    <td className="py-2 text-right">{moeda(m.receitaCaixaCentavos)}</td>
                    <td className="py-2 text-right">{moeda(m.custoCompetenciaCentavos)}</td>
                    <td className="py-2 text-right">{moeda(m.custoCaixaCentavos)}</td>
                    <td className="py-2 text-right">{moeda(m.resultadoCompetenciaCentavos)}</td>
                    <td className="py-2 text-right">{moeda(m.resultadoCaixaCentavos)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td className="py-2">Total</td>
                  <td className="py-2 text-right">{moeda(soma('receitaCompetenciaCentavos'))}</td>
                  <td className="py-2 text-right">{moeda(soma('receitaCaixaCentavos'))}</td>
                  <td className="py-2 text-right">{moeda(soma('custoCompetenciaCentavos'))}</td>
                  <td className="py-2 text-right">{moeda(soma('custoCaixaCentavos'))}</td>
                  <td className="py-2 text-right">{moeda(soma('resultadoCompetenciaCentavos'))}</td>
                  <td className="py-2 text-right">{moeda(soma('resultadoCaixaCentavos'))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Exportação contábil</h2>
        {d.semRegra.length > 0 ? (
          <Alerta tipo="aviso">
            Sem regra de lançamento:{' '}
            {d.semRegra.map((s) => `${s.nome} (${s.quantidade})`).join(', ')}.{' '}
            <Link href="/configuracoes/contabilidade" className="underline">
              Configurar contas
            </Link>
          </Alerta>
        ) : d.totalEventos > 0 ? (
          <Alerta tipo="sucesso">Todos os {d.totalEventos} fatos do período têm regra.</Alerta>
        ) : null}
        {d.semRegra.length === 0 && d.lancamentos.length > 0 && (
          <a
            href={`/spes/${speId}/contabil/arquivo?inicio=${inicio}&fim=${fim}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Baixar lançamentos ({d.lancamentos.length})
          </a>
        )}
        {d.lancamentos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Lançamentos">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Data</th>
                  <th className="py-2 font-normal">Débito</th>
                  <th className="py-2 font-normal">Crédito</th>
                  <th className="py-2 text-right font-normal">Valor</th>
                  <th className="py-2 font-normal">Histórico</th>
                </tr>
              </thead>
              <tbody>
                {d.lancamentos.slice(0, 50).map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 whitespace-nowrap">{formatarData(l.data)}</td>
                    <td className="py-2 font-mono">{l.debito}</td>
                    <td className="py-2 font-mono">{l.credito}</td>
                    <td className="py-2 text-right whitespace-nowrap">{moeda(l.valorCentavos)}</td>
                    <td className="py-2">{l.historico}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.lancamentos.length > 50 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Mostrando 50 de {d.lancamentos.length}; o arquivo traz todos.
              </p>
            )}
          </div>
        )}
      </Cartao>
    </>
  )
}
