import { carregarContrato, regrasDistrato } from '@norteia/aplicacao'
import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { Decimal, arredondarCentavos, somarMeses } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ConvitePortal } from '@/components/convite-portal'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import {
  FormularioAntecipacao,
  FormularioCancelarCobranca,
  FormularioEmitirCobranca,
  FormularioEstornoRecebimento,
  FormularioReajuste,
  FormularioRecebimento,
  FormularioCessao,
  FormularioDistrato,
  FormularioPagarDevolucao,
  FormularioRenegociacao,
  FormularioTrocaLote,
} from '../formularios'

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
  searchParams: Promise<{
    novo?: string
    recebido?: string
    estornado?: string
    reajustado?: string
    cobranca?: string
    cobrancaCancelada?: string
    renegociado?: string
    antecipado?: string
    cedido?: string
    trocado?: string
    distratado?: string
  }>
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
  const podeDistratar =
    temPapel(ctx, 'dono', 'financeiro', 'comercial_gestor') && c.situacao === 'vigente'
  const regras = podeDistratar
    ? await regrasDistrato(ctx.db, ctx.tenant.id, id, hoje).catch(() => null)
    : null
  const pct = (d: { times: (n: number) => { toString: () => string } }) =>
    d.times(100).toString().replace('.', ',')
  const podeDocumentos = temPapel(ctx, 'dono', 'financeiro', 'contador', 'comercial_gestor')
  const baseDocs = `/empreendimentos/${id}/carteira/${contratoId}/documentos`
  const podeCeder =
    temPapel(ctx, 'dono', 'financeiro', 'comercial_gestor') && c.situacao === 'vigente'
  const podeTrocar = temPapel(ctx, 'dono', 'comercial_gestor') && c.situacao === 'vigente'
  const [{ data: venda }, { data: lotesLivres }] = await Promise.all([
    ctx.db.from('vendas').select('preco_centavos').eq('id', c.vendaId).single(),
    podeTrocar
      ? ctx.db
          .from('lotes')
          .select('id, numero, preco_base_centavos, quadras(codigo)')
          .eq('empreendimento_id', id)
          .eq('status', 'disponivel')
          .order('numero')
      : Promise.resolve({
          data: [] as {
            id: string
            numero: string
            preco_base_centavos: number | null
            quadras: { codigo: string } | null
          }[],
        }),
  ])
  // Informe de IR: um por ano com pagamento.
  const anosComPagamento = [
    ...new Set(
      c.parcelas.flatMap((p) =>
        p.recebimentos.filter((r) => !r.estornado).map((r) => r.data.slice(0, 4)),
      ),
    ),
  ].sort((a, b) => b.localeCompare(a))
  const abertas = c.parcelas
    .filter((p) => p.situacao === 'aberta')
    .map((p) => ({
      id: p.id,
      numero: p.numero,
      vencimento: p.vencimento,
      saldoCentavos: p.saldoCentavos,
    }))
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
      {avisos.cobranca && (
        <Alerta tipo="sucesso">Boleto/Pix emitido no Asaas. Envie o link ao comprador.</Alerta>
      )}
      {avisos.cobrancaCancelada && <Alerta tipo="sucesso">Cobrança cancelada no Asaas.</Alerta>}
      {avisos.renegociado && (
        <Alerta tipo="sucesso">
          Aditivo de renegociação registrado. As parcelas antigas ficam no histórico.
        </Alerta>
      )}
      {avisos.antecipado && <Alerta tipo="sucesso">Antecipação registrada.</Alerta>}
      {avisos.cedido && (
        <Alerta tipo="sucesso">Cessão registrada: o contrato agora é do cessionário.</Alerta>
      )}
      {avisos.distratado && (
        <Alerta tipo="sucesso">
          Distrato executado: parcelas canceladas, lote de volta ao estoque e devolução no fluxo.
        </Alerta>
      )}
      {avisos.trocado && (
        <Alerta tipo="sucesso">Troca de lote registrada: o lote anterior voltou ao estoque.</Alerta>
      )}
      {c.situacao === 'quitado' && (
        <Alerta tipo="sucesso">
          Contrato quitado.{' '}
          <Link
            href={`/empreendimentos/${id}/carteira/${c.id}/quitacao`}
            className="font-medium underline underline-offset-4"
          >
            Emitir termo de quitação
          </Link>
        </Alerta>
      )}
      {avisos.reajustado !== undefined && (
        <Alerta tipo={avisos.reajustado === '0' ? 'aviso' : 'sucesso'}>
          {avisos.reajustado === '0'
            ? 'Nenhum reajuste a aplicar agora: aniversário ainda não chegou ou índices não publicados.'
            : `${avisos.reajustado} reajuste(s) aplicado(s).`}
        </Alerta>
      )}

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

      {podeDocumentos && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="text-muted-foreground">Documentos (Word):</span>
          <a href={`${baseDocs}/contrato`} className="text-primary underline underline-offset-4">
            Contrato
          </a>
          {c.situacao === 'quitado' && (
            <a href={`${baseDocs}/quitacao`} className="text-primary underline underline-offset-4">
              Termo de quitação
            </a>
          )}
          {anosComPagamento.map((ano) => (
            <a
              key={ano}
              href={`${baseDocs}/informe_pagamentos?ano=${ano}`}
              className="text-primary underline underline-offset-4"
            >
              Informe de pagamentos {ano}
            </a>
          ))}
          <Link
            href="/configuracoes/modelos"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            modelos
          </Link>
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        Reajuste: {c.indiceReajuste ?? 'sem reajuste'} · multa{' '}
        {formatarPercentual(c.regra.multa.toString(), 2)} · juros de mora{' '}
        {formatarPercentual(c.regra.jurosMoraMensal.toString(), 2)} ao mês ·{' '}
        <Link
          href={`/empreendimentos/${id}/lotes/${c.loteId}`}
          className="text-primary underline underline-offset-4"
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

      {(podeCeder || podeTrocar) && abertas.length > 0 && (
        <Cartao className="flex flex-col gap-3">
          {podeCeder && (
            <details>
              <summary className="cursor-pointer font-semibold">Ceder contrato (aditivo)</summary>
              <div className="mt-3">
                <FormularioCessao empreendimentoId={id} contratoId={c.id} hoje={hoje} />
              </div>
            </details>
          )}
          {podeTrocar && (
            <details>
              <summary className="cursor-pointer font-semibold">Trocar de lote (aditivo)</summary>
              <div className="mt-3">
                <FormularioTrocaLote
                  empreendimentoId={id}
                  contratoId={c.id}
                  lotes={(lotesLivres ?? []).map((l) => ({
                    id: l.id,
                    rotulo: `Quadra ${l.quadras?.codigo ?? '?'} · Lote ${l.numero}`,
                    precoCentavos: l.preco_base_centavos,
                  }))}
                  saldoCentavos={c.totais.saldoCentavos}
                  precoAtualCentavos={venda?.preco_centavos ?? 0}
                  jurosMensal={c.jurosMensal}
                  sistema={c.sistema}
                  hoje={hoje}
                  primeiraParcela={somarMeses(hoje, 1)}
                />
              </div>
            </details>
          )}
        </Cartao>
      )}

      {podeReceber && abertas.length > 0 && (
        <Cartao className="flex flex-col gap-3">
          <details>
            <summary className="cursor-pointer font-semibold">Antecipar parcelas</summary>
            <div className="mt-3">
              <FormularioAntecipacao
                empreendimentoId={id}
                contratoId={c.id}
                abertas={abertas}
                jurosMensal={c.jurosMensal}
                hoje={hoje}
              />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer font-semibold">Renegociar (aditivo)</summary>
            <div className="mt-3">
              <FormularioRenegociacao
                empreendimentoId={id}
                contratoId={c.id}
                abertas={abertas}
                regra={regra}
                jurosMensal={c.jurosMensal}
                sistema={c.sistema}
                hoje={hoje}
                primeiraParcela={somarMeses(hoje, 1)}
              />
            </div>
          </details>
        </Cartao>
      )}

      {podeDistratar && (
        <Cartao className="flex flex-col gap-3">
          <details>
            <summary className="cursor-pointer font-semibold">Distrato (art. 32-A)</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Regras padrão da sua loteadora em{' '}
                <Link
                  href="/configuracoes/parametros"
                  className="text-primary underline underline-offset-4"
                >
                  Parâmetros
                </Link>
                ; ajuste aqui só para este contrato.
              </p>
              <FormularioDistrato
                empreendimentoId={id}
                contratoId={c.id}
                hoje={hoje}
                padrao={{
                  clausula: regras ? pct(regras.clausulaPenal) : '10',
                  fruicao: regras ? pct(regras.fruicaoMensal) : '0,75',
                  parcelas: String(regras?.parcelasDevolucao ?? 12),
                  carencia: String(regras?.carenciaMeses ?? 12),
                }}
              />
            </div>
          </details>
        </Cartao>
      )}

      {c.distrato && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Distrato em {formatarData(c.distrato.data)}</h2>
          <p className="text-sm text-muted-foreground">
            Motivo: {c.distrato.motivo} · devolução de {moeda(c.distrato.devolucaoCentavos)}
          </p>
          {c.distrato.devolucoes.length > 0 && (
            <ul className="divide-y text-sm">
              {c.distrato.devolucoes.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    Devolução {d.numero} · vence {formatarData(d.vencimento)} ·{' '}
                    {moeda(d.valorCentavos)}
                  </span>
                  {d.pagoEm ? (
                    <span className="text-muted-foreground">paga em {formatarData(d.pagoEm)}</span>
                  ) : temPapel(ctx, 'dono', 'financeiro') ? (
                    <FormularioPagarDevolucao
                      empreendimentoId={id}
                      contratoId={c.id}
                      devolucaoId={d.id}
                    />
                  ) : (
                    <span className="text-muted-foreground">a pagar</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      {c.aditivos.length > 0 && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Aditivos</h2>
          <ul className="divide-y text-sm">
            {c.aditivos.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 py-2">
                {a.tipo === 'cessao' ? (
                  <span>
                    {formatarData(a.data)} · cessão do contrato · saldo cedido{' '}
                    {moeda(a.saldoAnteriorCentavos)}
                  </span>
                ) : (
                  <span>
                    {formatarData(a.data)} ·{' '}
                    {a.tipo === 'troca_lote'
                      ? 'troca de lote'
                      : `renegociação de ${a.parcelasAnteriores} parcela(s)`}
                    : {moeda(a.saldoAnteriorCentavos)}
                    {a.encargosCentavos > 0 &&
                      ` + ${a.tipo === 'troca_lote' ? 'diferença de preço' : 'encargos'} ${moeda(a.encargosCentavos)}`}
                    {a.descontoCentavos > 0 &&
                      ` − ${a.tipo === 'troca_lote' ? 'diferença de preço' : 'desconto'} ${moeda(a.descontoCentavos)}`}{' '}
                    = <strong>{moeda(a.novoSaldoCentavos)}</strong>
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  Motivo: {a.motivo}
                  {podeDocumentos && (
                    <>
                      {' · '}
                      <a
                        href={`${baseDocs}/aditivo_${a.tipo}?aditivo=${a.id}`}
                        className="text-primary underline underline-offset-4"
                      >
                        baixar aditivo (Word)
                      </a>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {c.indiceReajuste && (
        <Cartao className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Reajuste ({c.indiceReajuste})</h2>
            {podeReceber && <FormularioReajuste empreendimentoId={id} contratoId={c.id} />}
          </div>
          <p className="text-sm text-muted-foreground">
            A cada {c.regrasReajuste.periodicidadeMeses} meses da venda, pelo acumulado do índice
            até {c.regrasReajuste.defasagemMeses} meses antes do aniversário (só índices
            publicados). Deflação:{' '}
            {c.regrasReajuste.negativo === 'ignorar'
              ? 'não reduz as parcelas'
              : 'reduz as parcelas'}
            .
          </p>
          {c.reajustes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum reajuste aplicado ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {c.reajustes.map((r) => (
                <li key={r.aniversario} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {formatarData(r.aniversario)} · {r.indice}{' '}
                    {formatarData(r.competenciaInicial).slice(3)} a{' '}
                    {formatarData(r.competenciaFinal).slice(3)}:{' '}
                    {formatarPercentual(new Decimal(r.fator).minus(1).toString(), 2)}
                    {r.fatorAplicado !== r.fator && ' (deflação ignorada)'}
                  </span>
                  <span className="text-muted-foreground">
                    {r.parcelas} parcela(s) · {moeda(r.diferencaCentavos)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Parcelas</h2>
        <div className="overflow-x-auto" tabIndex={0}>
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
                    <td className="py-2 text-right">
                      {moeda(p.valorCentavos)}
                      {p.correcaoCentavos !== 0 && (
                        <div className="text-xs text-muted-foreground">
                          reajuste {moeda(p.correcaoCentavos)}
                        </div>
                      )}
                    </td>
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
                        'Renegociada'
                      ) : atrasada ? (
                        <span className="font-medium text-destructive">
                          Em atraso · {p.encargosHoje.diasAtraso} dias
                        </span>
                      ) : (
                        'A vencer'
                      )}
                      {p.cobranca?.situacao === 'pendente' && (
                        <div className="mt-1 text-xs">
                          {p.cobranca.linkFatura ? (
                            <a
                              href={p.cobranca.linkFatura}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary underline underline-offset-4"
                            >
                              Boleto/Pix de {moeda(p.cobranca.valorCentavos)}
                            </a>
                          ) : (
                            'Cobrança emitida'
                          )}{' '}
                          · vence {formatarData(p.cobranca.vencimento)}
                          {podeReceber && (
                            <FormularioCancelarCobranca
                              empreendimentoId={id}
                              contratoId={c.id}
                              cobrancaId={p.cobranca.id}
                            />
                          )}
                        </div>
                      )}
                      {p.cobranca?.situacao === 'divergente' && (
                        <div className="mt-1 text-xs text-destructive">
                          Pagamento no Asaas a conferir: {p.cobranca.motivo}
                        </div>
                      )}
                      {p.situacao === 'aberta' &&
                        p.cobranca?.situacao !== 'pendente' &&
                        podeReceber &&
                        c.asaasAtivo && (
                          <FormularioEmitirCobranca
                            empreendimentoId={id}
                            contratoId={c.id}
                            parcelaId={p.id}
                          />
                        )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Cartao>

      {c.compradorPortal && temPapel(ctx, 'dono', 'financeiro', 'comercial_gestor') && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Portal do comprador</h2>
          <ConvitePortal
            tipo="comprador"
            alvoId={c.compradorPortal.id}
            email={c.compradorPortal.email}
            ativo={c.compradorPortal.ativo}
          />
        </Cartao>
      )}
    </>
  )
}
