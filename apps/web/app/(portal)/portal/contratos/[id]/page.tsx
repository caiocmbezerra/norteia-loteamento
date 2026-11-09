import { andamentoObra, carregarContratoPortal } from '@norteia/aplicacao'
import { formatarData, formatarMoeda } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirUsuario } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { BotaoSegundaVia } from '../../botao-segunda-via'

export const metadata: Metadata = { title: 'Meu contrato' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))

export default async function PaginaContratoPortal({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { db } = await exigirUsuario()
  const [c, obra] = await Promise.all([carregarContratoPortal(db, id), andamentoObra(db, id)])
  if (!c) notFound()
  const obraOrcado = obra.reduce((t, e) => t + e.orcado, 0)
  const obraPago = obra.reduce((t, e) => t + e.pago, 0)
  const pct = (pago: number, orcado: number) => Math.min(100, Math.round((pago / orcado) * 100))
  const hoje = hojeSaoPaulo()
  const abertas = c.parcelas.filter((p) => p.situacao === 'aberta')
  const saldo = abertas.reduce((t, p) => t + p.valor - p.pago, 0)
  const vencido = abertas
    .filter((p) => p.vencimento < hoje)
    .reduce((t, p) => t + p.valor - p.pago, 0)
  // Informe de pagamentos por ano (para a declaração de IR do comprador).
  const porAno = new Map<string, number>()
  for (const p of c.pagamentos)
    porAno.set(p.data.slice(0, 4), (porAno.get(p.data.slice(0, 4)) ?? 0) + p.valor)

  return (
    <>
      <Link href="/portal" className="text-sm text-muted-foreground hover:underline">
        ← Meu portal
      </Link>
      <TituloPagina titulo={c.lote} subtitulo={`${c.loteadora} · ${c.empreendimento}`} />
      {c.situacao === 'quitado' && (
        <Alerta tipo="sucesso">
          Contrato quitado{c.quitado_em ? ` em ${formatarData(c.quitado_em)}` : ''}.
        </Alerta>
      )}
      {c.situacao === 'distratado' && <Alerta tipo="aviso">Este contrato foi distratado.</Alerta>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Indicador rotulo="Saldo a pagar" valor={moeda(saldo)} />
        <Indicador rotulo="Em atraso" valor={moeda(vencido)} />
        <Indicador
          rotulo="Reajuste"
          valor={c.indice ?? 'Sem reajuste'}
          {...(c.indice ? { nota: 'Aplicado no aniversário do contrato' } : {})}
        />
      </div>
      {!c.boleto_disponivel && abertas.length > 0 && (
        <Alerta tipo="aviso">
          A loteadora ainda não emite boleto pelo portal. Para pagar, fale com ela.
        </Alerta>
      )}

      {obra.length > 0 && (
        <Cartao className="flex flex-col gap-3" aria-label="Andamento da obra">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Andamento da obra</h2>
            <span className="text-sm font-medium">{pct(obraPago, obraOrcado)}% executado</span>
          </div>
          <ul className="flex flex-col gap-3">
            {obra.map((e) => (
              <li key={e.etapa} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm">
                  <span>{e.etapa}</span>
                  <span className="text-muted-foreground">{pct(e.pago, e.orcado)}%</span>
                </div>
                <div
                  role="progressbar"
                  aria-label={e.etapa}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={pct(e.pago, e.orcado)}
                  className="h-2 overflow-hidden rounded bg-muted"
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${pct(e.pago, e.orcado)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Avanço financeiro da infraestrutura: o que já foi pago de cada etapa sobre o orçamento.
          </p>
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Parcelas</h2>
        <ul className="flex flex-col divide-y">
          {c.parcelas.map((p) => {
            const atrasada = p.situacao === 'aberta' && p.vencimento < hoje
            return (
              <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">
                    {p.numero === 0 ? 'Entrada' : `Parcela ${p.numero}`} ·{' '}
                    {formatarData(p.vencimento)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {moeda(p.valor)}
                    {p.situacao === 'paga'
                      ? ' · paga'
                      : p.pago > 0
                        ? ` · pago ${moeda(p.pago)}`
                        : ''}
                    {atrasada && <strong className="text-destructive"> · em atraso</strong>}
                  </span>
                </div>
                {p.situacao === 'aberta' && c.boleto_disponivel && (
                  <div className="sm:w-56">
                    <BotaoSegundaVia
                      parcelaId={p.id}
                      rotulo={p.link ? 'Abrir boleto/Pix' : 'Gerar boleto/Pix'}
                      tamanho="sm"
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Cartao>

      <Cartao className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Pagamentos</h2>
        {c.pagamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
        ) : (
          <>
            <ul className="flex flex-col divide-y text-sm">
              {c.pagamentos.map((p, i) => (
                <li key={i} className="flex justify-between gap-2 py-2">
                  <span>
                    {formatarData(p.data)} · {p.parcela === 0 ? 'entrada' : `parcela ${p.parcela}`}
                  </span>
                  <span className="font-medium">{moeda(p.valor)}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">Informe de pagamentos por ano</h3>
              <p className="text-xs text-muted-foreground">
                Total pago em cada ano e o informe para a sua declaração de imposto de renda.
              </p>
              <ul className="flex flex-col divide-y text-sm">
                {[...porAno].map(([ano, total]) => (
                  <li key={ano} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{ano}</span>
                    <span className="flex items-center gap-3">
                      <span className="font-medium">{moeda(total)}</span>
                      <a
                        href={`/portal/contratos/${c.id}/informe?ano=${ano}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        Baixar informe {ano}
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Cartao>
    </>
  )
}
