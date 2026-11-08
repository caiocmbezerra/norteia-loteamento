import { carregarContrato } from '@norteia/aplicacao'
import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { FormularioEstornoRecebimento, FormularioRecebimento } from '../formularios'

export const metadata: Metadata = { title: 'Contrato' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const SITUACAO: Record<string, string> = {
  vigente: 'Vigente',
  quitado: 'Quitado',
  distratado: 'Distratado',
  cedido: 'Cedido',
}

export default async function PaginaContrato({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; contratoId: string }>
  searchParams: Promise<{ novo?: string; recebido?: string; estornado?: string }>
}) {
  const [{ id, contratoId }, avisos] = await Promise.all([params, searchParams])
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
  const hoje = hojeSaoPaulo()
  const c = await carregarContrato(ctx.db, contratoId, hoje)
  if (!c || c.empreendimentoId !== id) notFound()
  const podeReceber = temPapel(ctx, 'dono', 'financeiro') && c.situacao === 'vigente'
  const proxima = c.parcelas.find((p) => p.situacao === 'aberta')
  const regra = {
    multa: c.regra.multa.toString(),
    jurosMoraMensal: c.regra.jurosMoraMensal.toString(),
  }

  return (
    <>
      <Link
        href={`/empreendimentos/${id}/carteira`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Carteira · {c.empreendimentoNome}
      </Link>
      <TituloPagina
        titulo={c.lote}
        subtitulo={`${c.comprador ?? 'Comprador'} · contrato ${SITUACAO[c.situacao] ?? c.situacao}${c.quitadoEm ? ` em ${formatarData(c.quitadoEm)}` : ''}`}
      />
      {avisos.novo && <Alerta tipo="sucesso">Contrato gerado com as parcelas da venda.</Alerta>}
      {avisos.recebido && <Alerta tipo="sucesso">Recebimento registrado.</Alerta>}
      {avisos.estornado && <Alerta tipo="sucesso">Recebimento estornado.</Alerta>}

      <section aria-label="Resumo do contrato" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Total do contrato" valor={moeda(c.totais.valorCentavos)} />
        <Indicador rotulo="Recebido" valor={moeda(c.totais.recebidoCentavos)} nota="sem encargos" />
        <Indicador rotulo="Saldo" valor={moeda(c.totais.saldoCentavos)} />
        <Indicador
          rotulo="Vencido"
          valor={moeda(c.totais.vencidoCentavos)}
          nota={
            c.totais.encargosHojeCentavos > 0
              ? `+ ${moeda(c.totais.encargosHojeCentavos)} de encargos hoje`
              : undefined
          }
        />
      </section>

      <p className="text-sm text-muted-foreground">
        Reajuste: {c.indiceReajuste ?? 'sem reajuste'} · multa{' '}
        {formatarPercentual(c.regra.multa.toString(), 2)} · juros de mora{' '}
        {formatarPercentual(c.regra.jurosMoraMensal.toString(), 2)} ao mês ·{' '}
        <Link
          href={`/empreendimentos/${id}/lotes/${c.loteId}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          ver lote
        </Link>
      </p>

      {podeReceber && proxima && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">
            Receber {proxima.numero === 0 ? 'a entrada' : `a parcela ${proxima.numero}`} · vence em{' '}
            {formatarData(proxima.vencimento)} · saldo {moeda(proxima.saldoCentavos)}
          </h2>
          <FormularioRecebimento
            key={`${proxima.id}-${proxima.saldoCentavos}`}
            empreendimentoId={id}
            contratoId={c.id}
            parcela={proxima}
            regra={regra}
            hoje={hoje}
          />
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Parcelas</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-normal">Nº</th>
                <th className="py-2 font-normal">Vencimento</th>
                <th className="py-2 text-right font-normal">Valor</th>
                <th className="py-2 text-right font-normal">Pago</th>
                <th className="py-2 text-right font-normal">Situação</th>
              </tr>
            </thead>
            <tbody>
              {c.parcelas.map((p) => {
                const atrasada = p.situacao === 'aberta' && p.vencimento < hoje
                return (
                  <tr key={p.id} className="border-t align-top">
                    <td className="py-2">{p.numero === 0 ? 'Entrada' : p.numero}</td>
                    <td className="py-2">{formatarData(p.vencimento)}</td>
                    <td className="py-2 text-right">{moeda(p.valorCentavos)}</td>
                    <td className="py-2 text-right">
                      {p.pagoCentavos > 0 ? moeda(p.pagoCentavos) : '—'}
                      {p.recebimentos.map((r) => (
                        <div key={r.id} className="mt-1 text-xs text-muted-foreground">
                          <span className={r.estornado ? 'line-through' : undefined}>
                            {formatarData(r.data)} · {moeda(r.valorCentavos)}
                            {r.multaCentavos + r.jurosMoraCentavos > 0 &&
                              ` (encargos ${moeda(r.multaCentavos + r.jurosMoraCentavos)})`}
                            {r.descontoCentavos > 0 && ` · desconto ${moeda(r.descontoCentavos)}`}
                          </span>
                          {r.estornado && <span> · estornado: {r.motivoEstorno}</span>}
                          {!r.estornado && temPapel(ctx, 'dono', 'financeiro') && (
                            <div className="mt-1 flex justify-end">
                              <FormularioEstornoRecebimento
                                empreendimentoId={id}
                                contratoId={c.id}
                                recebimentoId={r.id}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </td>
                    <td className="py-2 text-right">
                      {p.situacao === 'paga' ? (
                        'Paga'
                      ) : p.situacao === 'cancelada' ? (
                        'Cancelada'
                      ) : atrasada ? (
                        <span className="font-medium text-destructive">
                          Em atraso · {p.encargosHoje.diasAtraso} dias
                        </span>
                      ) : (
                        'A vencer'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Cartao>
    </>
  )
}
