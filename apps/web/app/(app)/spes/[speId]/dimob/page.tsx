import { carregarDimob } from '@norteia/aplicacao'
import { formatarData, formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import {
  FormularioArquivo,
  FormularioCpf,
  FormularioDadosEmpreendimento,
  FormularioDadosSpe,
} from './formularios'

export const metadata: Metadata = { title: 'DIMOB' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))

export default async function PaginaDimob({
  params,
  searchParams,
}: {
  params: Promise<{ speId: string }>
  searchParams: Promise<{ ano?: string }>
}) {
  const { speId } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador')) redirect('/painel')
  const anoAtual = Number(hojeSaoPaulo().slice(0, 4))
  const pedido = Number((await searchParams).ano)
  // A DIMOB de um ano é entregue no início do ano seguinte: o padrão é o ano anterior.
  const ano =
    Number.isInteger(pedido) && pedido >= 2021 && pedido <= anoAtual ? pedido : anoAtual - 1
  const d = await carregarDimob(ctx.db, speId, ano)
  if (!d) notFound()
  const podeEditar = temPapel(ctx, 'dono')
  const semCpf = new Map(
    d.operacoes
      .filter((o) =>
        d.pendencias.some((p) => p.ref === o.contrato_id && p.mensagem.includes('CPF/CNPJ')),
      )
      .map((o) => [o.comprador_id, o.comprador]),
  )
  const anos = Array.from({ length: anoAtual - 2020 }, (_, i) => anoAtual - i)

  return (
    <>
      <Link href={`/spes/${speId}`} className="text-sm text-muted-foreground hover:underline">
        ← {d.declarante.nome}
      </Link>
      <TituloPagina
        titulo={`DIMOB ${ano}`}
        subtitulo="Vendas de lotes da SPE no ano (ficha Construção e incorporação). O arquivo é importado no programa da Receita, que valida e transmite."
      />
      <nav aria-label="Ano-calendário" className="flex flex-wrap gap-2 text-sm">
        {anos.map((a) => (
          <Link
            key={a}
            href={`/spes/${speId}/dimob?ano=${a}`}
            aria-current={a === ano ? 'page' : undefined}
            className="rounded-md border px-3 py-1 aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            {a}
          </Link>
        ))}
      </nav>
      <section aria-label="Resumo da DIMOB" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Operações" valor={String(d.operacoes.length)} />
        <Indicador rotulo="Valor das operações" valor={moeda(d.totalOperacaoCentavos)} />
        <Indicador
          rotulo="Pago no ano"
          valor={moeda(d.totalPagoCentavos)}
          nota={d.pagoComEncargos ? 'com multa e juros de mora' : 'sem multa e juros de mora'}
        />
        <Indicador rotulo="Leiaute" valor={d.versaoLeiaute ?? '—'} />
      </section>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Pendências</h2>
        {d.pendencias.length === 0 ? (
          <Alerta tipo="sucesso">Nenhuma pendência: o arquivo pode ser gerado.</Alerta>
        ) : (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {d.pendencias.map((p, i) => (
              <li key={i}>{p.mensagem}</li>
            ))}
          </ul>
        )}
        {[...semCpf].map(([id, nome]) => (
          <FormularioCpf key={id} speId={speId} compradorId={id} nome={nome} />
        ))}
      </Cartao>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Gerar arquivo</h2>
        <FormularioArquivo speId={speId} ano={ano} bloqueado={d.pendencias.length > 0} />
        <p className="text-xs text-muted-foreground">
          Confira com o contador: quais contratos entram e se o valor pago inclui encargos
          (parâmetro <code>fiscal.dimob_pago_com_encargos</code>).
        </p>
      </Cartao>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Operações</h2>
        {d.operacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma venda ou pagamento no ano.</p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Contrato</th>
                  <th className="py-2 font-normal">Comprador</th>
                  <th className="py-2 font-normal">Imóvel</th>
                  <th className="py-2 font-normal">Data</th>
                  <th className="py-2 text-right font-normal">Valor</th>
                  <th className="py-2 text-right font-normal">Pago no ano</th>
                </tr>
              </thead>
              <tbody>
                {d.operacoes.map((o) => (
                  <tr key={o.contrato_id} className="border-t">
                    <td className="py-2">{o.numero}</td>
                    <td className="py-2">{o.comprador}</td>
                    <td className="py-2">{o.imovel}</td>
                    <td className="py-2">{formatarData(o.data)}</td>
                    <td className="py-2 text-right">{moeda(o.valor_operacao)}</td>
                    <td className="py-2 text-right">{moeda(o.pago_no_ano)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {podeEditar && (
        <Cartao className="flex flex-col gap-4">
          <h2 className="font-semibold">Dados para a declaração</h2>
          <FormularioDadosSpe speId={speId} valores={d.declarante} />
          {d.empreendimentos.map((e) => (
            <section
              key={e.id}
              aria-label={`Dados fiscais de ${e.nome}`}
              className="flex flex-col gap-2 border-t pt-4"
            >
              <h3 className="text-sm font-semibold">
                {e.nome} ({e.municipio}/{e.uf})
              </h3>
              <FormularioDadosEmpreendimento speId={speId} empreendimento={e} />
            </section>
          ))}
        </Cartao>
      )}
    </>
  )
}
