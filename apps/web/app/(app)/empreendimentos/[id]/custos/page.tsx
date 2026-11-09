import { carregarPainelCustos } from '@norteia/aplicacao'
import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { type Decimal, arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import { cn } from '@/lib/utils'
import { revisarOrcamento } from './acoes'
import {
  FormularioConta,
  FormularioContrato,
  FormularioEstorno,
  FormularioAnexo,
  FormularioMedicao,
  FormularioPagar,
} from './formularios'

export const metadata: Metadata = { title: 'Custos e obra' }

const moeda = (c: Decimal) => formatarMoeda(arredondarCentavos(c))
const centavosTexto = (c: number) =>
  formatarMoeda(arredondarCentavos(String(c))).replace(/^R\$\s/, '')
const pct = (f: Decimal | null | undefined) => (f ? formatarPercentual(f, 1) : '—')

export default async function PaginaCustos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await exigirContexto()
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  if (!temPapel(ctx, 'dono', 'financeiro', 'engenharia', 'contador', 'socio_leitura')) {
    return <Alerta tipo="aviso">Custos não estão disponíveis para o seu papel.</Alerta>
  }
  const hoje = hojeSaoPaulo()
  const podeEditar = temPapel(ctx, 'dono', 'financeiro', 'engenharia')

  const [
    painel,
    { data: contratos },
    { data: contas },
    { data: pagamentos },
    { data: fornecedores },
    { data: centros },
  ] = await Promise.all([
    carregarPainelCustos(ctx.db, id, hoje),
    ctx.db
      .from('contratos_fornecedor')
      .select(
        'id, descricao, centro_codigo, valor_centavos, data_fim_prevista, situacao, fornecedores(nome), medicoes(id, numero, data, percentual_acumulado, valor_centavos, contas_pagar(cancelada_em))',
      )
      .eq('empreendimento_id', id)
      .order('data_inicio'),
    ctx.db
      .from('contas_pagar')
      .select(
        'id, descricao, valor_centavos, vencimento, cancelada_em, pagamentos(valor_centavos, estornado_em), anexos_conta(id, nome)',
      )
      .eq('empreendimento_id', id)
      .is('cancelada_em', null)
      .order('vencimento'),
    ctx.db
      .from('pagamentos')
      .select(
        'id, data_pagamento, valor_centavos, estornado_em, motivo_estorno, contas_pagar!inner(descricao, empreendimento_id, anexos_conta(id, nome))',
      )
      .eq('contas_pagar.empreendimento_id', id)
      .order('data_pagamento', { ascending: false })
      .limit(20),
    ctx.db.from('fornecedores').select('id, nome').eq('tenant_id', ctx.tenant.id).order('nome'),
    ctx.db
      .from('centros_custo')
      .select('codigo, nome')
      .eq('tenant_id', ctx.tenant.id)
      .eq('ativo', true)
      .order('ordem'),
  ])

  const nome = (c: string) => painel.nomesCentros[c] ?? c
  const abertas = (contas ?? [])
    .map((c) => ({
      ...c,
      saldo:
        c.valor_centavos -
        c.pagamentos.filter((p) => !p.estornado_em).reduce((s, p) => s + p.valor_centavos, 0),
    }))
    .filter((c) => c.saldo > 0)
  const opcoesCentros = (centros ?? []).map((c) => ({ valor: c.codigo, rotulo: c.nome }))
  const opcoesFornecedores = (fornecedores ?? []).map((f) => ({ valor: f.id, rotulo: f.nome }))
  const t = painel.custos.total

  return (
    <>
      <Link
        href={`/empreendimentos/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {e.nome}
      </Link>
      <TituloPagina
        titulo="Custos e obra"
        subtitulo={`Situação em ${formatarData(hoje)} (mês ${painel.custos.mesAtual} do fluxo).`}
        acoes={
          <Button asChild variant="outline">
            <Link href={`/empreendimentos/${id}/custos/orcamento`}>Orçamento</Link>
          </Button>
        }
      />

      {painel.origemOrcamento === 'nenhum' && (
        <Alerta tipo="aviso">
          Aprove um estudo de viabilidade para ter o orçamento de referência.
        </Alerta>
      )}
      {painel.origemOrcamento === 'plano' && podeEditar && (
        <Alerta tipo="aviso">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              O orçamento ainda é o do plano aprovado. Revise-o para acompanhar a obra item a item.
            </span>
            <form action={revisarOrcamento.bind(null, id)}>
              <Button size="sm" type="submit">
                Revisar orçamento
              </Button>
            </form>
          </div>
        </Alerta>
      )}
      {t.estouro.isPositive() && !t.estouro.isZero() && (
        <Alerta>Gastos contratados ou pagos já passam do orçado em {moeda(t.estouro)}.</Alerta>
      )}

      <section aria-label="Resumo de custos" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Orçado"
          valor={moeda(t.orcado)}
          nota={painel.origemOrcamento === 'revisado' ? 'orçamento revisado' : 'plano aprovado'}
        />
        <Indicador rotulo="Pago (realizado)" valor={moeda(t.realizado)} />
        <Indicador
          rotulo="Contratado a pagar"
          valor={moeda(t.comprometido)}
          nota="contas em aberto e saldo de contratos"
        />
        <Indicador
          rotulo="Custo final projetado"
          valor={moeda(t.custoFinal)}
          nota={`${moeda(t.projetado)} ainda a contratar`}
        />
        <Indicador
          rotulo="TIR anual: plano → atual"
          valor={`${pct(painel.plano?.tir.anual)} → ${pct(painel.atual?.tir.anual)}`}
        />
        <Indicador
          rotulo="Exposição máxima: plano → atual"
          valor={painel.atual ? moeda(painel.atual.exposicaoMaxima.valor) : '—'}
          nota={painel.plano ? `plano: ${moeda(painel.plano.exposicaoMaxima.valor)}` : undefined}
        />
        <Indicador
          rotulo="Custo por lote"
          valor={painel.custoPorLote ? moeda(painel.custoPorLote) : '—'}
          nota="sem comissões"
        />
        <Indicador
          rotulo="Custo por m² de lote"
          valor={painel.custoPorM2 ? moeda(painel.custoPorM2) : '—'}
        />
      </section>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Por centro de custo</h2>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-right">
                <th className="py-2 text-left font-normal">Centro</th>
                <th className="py-2 font-normal">Orçado</th>
                <th className="py-2 font-normal">Pago</th>
                <th className="py-2 font-normal">Contratado</th>
                <th className="py-2 font-normal">A contratar</th>
                <th className="py-2 font-normal">Custo final</th>
                <th className="py-2 font-normal">Desvio</th>
              </tr>
            </thead>
            <tbody>
              {painel.custos.porCentro.map((c) => {
                const desvio = c.custoFinal.minus(c.orcado)
                return (
                  <tr key={c.centro} className="border-t text-right">
                    <td className="py-2 text-left">{nome(c.centro)}</td>
                    <td className="py-2">{moeda(c.orcado)}</td>
                    <td className="py-2">{moeda(c.realizado)}</td>
                    <td className="py-2">{moeda(c.comprometido)}</td>
                    <td className="py-2">{moeda(c.projetado)}</td>
                    <td className="py-2 font-medium">{moeda(c.custoFinal)}</td>
                    <td
                      className={cn(
                        'py-2',
                        desvio.isPositive() && !desvio.isZero() && 'font-medium text-destructive',
                      )}
                    >
                      {desvio.isZero() ? '—' : moeda(desvio)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Cartao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Contas a pagar em aberto</h2>
          {abertas.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma conta em aberto.</p>
          )}
          <ul className="divide-y">
            {abertas.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">{c.descricao}</span>
                  <span>
                    {formatarMoeda(arredondarCentavos(String(c.saldo)))} · vence{' '}
                    {formatarData(c.vencimento)}
                  </span>
                </div>
                <Anexos empreendimentoId={id} anexos={c.anexos_conta} />
                {podeEditar && (
                  <>
                    <FormularioPagar
                      empreendimentoId={id}
                      contaId={c.id}
                      saldo={centavosTexto(c.saldo)}
                      hoje={hoje}
                    />
                    <FormularioAnexo empreendimentoId={id} contaId={c.id} />
                  </>
                )}
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Pagamentos recentes</h2>
          {(pagamentos ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
          )}
          <ul className="divide-y">
            {(pagamentos ?? []).map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={cn(p.estornado_em && 'text-muted-foreground line-through')}>
                    {formatarData(p.data_pagamento)} · {p.contas_pagar.descricao}
                  </span>
                  <span
                    className={cn(
                      'font-medium',
                      p.estornado_em && 'text-muted-foreground line-through',
                    )}
                  >
                    {formatarMoeda(arredondarCentavos(String(p.valor_centavos)))}
                  </span>
                </div>
                <Anexos empreendimentoId={id} anexos={p.contas_pagar.anexos_conta} />
                {p.estornado_em ? (
                  <span className="text-xs text-muted-foreground">
                    Estornado: {p.motivo_estorno}
                  </span>
                ) : (
                  podeEditar && <FormularioEstorno empreendimentoId={id} pagamentoId={p.id} />
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      </div>

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Contratos com fornecedores</h2>
        {(contratos ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum contrato.</p>
        )}
        <ul className="divide-y">
          {(contratos ?? []).map((k) => {
            const medicoes = k.medicoes
              .filter((m) => !m.contas_pagar?.cancelada_em)
              .sort((a, b) => a.numero - b.numero)
            const executado = medicoes.at(-1)?.percentual_acumulado ?? 0
            const executadoPct = Number(executado) * 100
            return (
              <li key={k.id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span>
                    <span className="font-medium">{k.descricao}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {k.fornecedores?.nome} · {nome(k.centro_codigo)} · até{' '}
                      {formatarData(k.data_fim_prevista)}
                    </span>
                  </span>
                  <span>{formatarMoeda(arredondarCentavos(String(k.valor_centavos)))}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div
                    role="progressbar"
                    aria-label={`Execução de ${k.descricao}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(executadoPct)}
                    className="h-2 w-32 overflow-hidden rounded-full bg-muted"
                  >
                    <div className="h-full bg-primary" style={{ width: `${executadoPct}%` }} />
                  </div>
                  <span>
                    {formatarPercentual(String(executado), 2)} executado
                    {medicoes.length > 0 &&
                      ` · ${medicoes.length} medição(ões), última em ${formatarData(medicoes.at(-1)!.data)}`}
                  </span>
                </div>
                {podeEditar && k.situacao === 'vigente' && executadoPct < 100 && (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium">
                      Registrar medição
                    </summary>
                    <div className="mt-3">
                      <FormularioMedicao empreendimentoId={id} contratoId={k.id} hoje={hoje} />
                    </div>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      </Cartao>

      {podeEditar && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Cartao className="flex flex-col gap-3">
            <h2 className="font-semibold">Novo contrato</h2>
            {opcoesFornecedores.length === 0 && (
              <Alerta tipo="aviso">
                Cadastre um fornecedor em{' '}
                <Link className="underline" href="/configuracoes/fornecedores">
                  Configurações → Fornecedores
                </Link>
                .
              </Alerta>
            )}
            <FormularioContrato
              empreendimentoId={id}
              fornecedores={opcoesFornecedores}
              centros={opcoesCentros}
            />
          </Cartao>
          <Cartao className="flex flex-col gap-3">
            <h2 className="font-semibold">Nova conta a pagar</h2>
            <FormularioConta
              empreendimentoId={id}
              contratos={(contratos ?? [])
                .filter((k) => k.situacao === 'vigente')
                .map((k) => ({ valor: k.id, rotulo: k.descricao }))}
              centros={opcoesCentros}
              fornecedores={opcoesFornecedores}
            />
          </Cartao>
        </div>
      )}
    </>
  )
}

function Anexos({
  empreendimentoId,
  anexos,
}: {
  empreendimentoId: string
  anexos: { id: string; nome: string }[]
}) {
  if (anexos.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Anexos">
      {anexos.map((a) => (
        <li key={a.id}>
          <a
            href={`/empreendimentos/${empreendimentoId}/custos/anexos/${a.id}`}
            className="text-primary underline underline-offset-4"
            target="_blank"
            rel="noopener"
          >
            {a.nome}
          </a>
        </li>
      ))}
    </ul>
  )
}
