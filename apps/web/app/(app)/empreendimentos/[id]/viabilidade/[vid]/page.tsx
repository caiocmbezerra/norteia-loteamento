import { analisarViabilidade } from '@norteia/aplicacao'
import { type PremissasJson, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { Decimal, acumulado, arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { GraficoCaixa } from '@/components/viabilidade/grafico-caixa'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { cn } from '@/lib/utils'
import { FormularioAprovar } from './aprovar'
import { FormularioEstudo, type ValoresEstudo } from './formulario-estudo'

export const metadata: Metadata = { title: 'Estudo de viabilidade' }

const moeda = (c: Decimal) => formatarMoeda(arredondarCentavos(c))
const pct = (f: Decimal | null, casas = 2) => (f === null ? '—' : formatarPercentual(f, casas))
const pctForm = (fracao: string) => new Decimal(fracao).times(100).toString().replace('.', ',')
const brl = (c: number) => formatarMoeda(arredondarCentavos(new Decimal(c))).replace(/^R\$\s/, '')

function valoresIniciais(nome: string, p: PremissasJson, tma: number): ValoresEstudo {
  return {
    nome,
    lotesVendaveis: String(p.lotesVendaveis),
    precoLote: brl(p.precoLoteCentavos),
    vendasMesInicio: String(p.vendas.mesInicio),
    lotesPorMes: String(p.vendas.lotesPorMes),
    entrada: pctForm(p.pagamento.entrada),
    parcelas: String(p.pagamento.parcelas),
    jurosMensal: pctForm(p.pagamento.jurosMensal),
    sistema: p.pagamento.sistema,
    carenciaMeses: String(p.pagamento.carenciaMeses),
    comissao: pctForm(p.comissao),
    inadimplencia: pctForm(p.inadimplencia),
    aliquota: pctForm(p.aliquotaSobreRecebido),
    tmaMensal: pctForm(String(tma)),
    custos: p.custos.map((c) => ({
      descricao: c.descricao,
      centroCusto: c.centroCusto,
      tipo: c.tipo,
      valor: brl(c.valorCentavos),
      mesInicio: String(c.mesInicio),
      mesFim: String(c.mesFim),
    })),
  }
}

export default async function PaginaEstudo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; vid: string }>
  searchParams: Promise<{ editar?: string }>
}) {
  const [{ id, vid }, { editar }] = await Promise.all([params, searchParams])
  const ctx = await exigirContexto()
  const { data: v } = await ctx.db
    .from('viabilidades')
    .select('id, nome, situacao, premissas, tma_mensal, empreendimentos(nome)')
    .eq('id', vid)
    .eq('empreendimento_id', id)
    .maybeSingle()
  if (!v) notFound()
  const { count: versoes } = await ctx.db
    .from('plano_versoes')
    .select('id', { count: 'exact', head: true })
    .eq('empreendimento_id', id)

  const premissas = v.premissas as unknown as PremissasJson
  const a = analisarViabilidade(premissas, String(v.tma_mensal))
  const r = a.base
  const podeEditar = v.situacao === 'rascunho' && temPapel(ctx, 'dono', 'financeiro', 'engenharia')
  const podeAprovar = v.situacao === 'rascunho' && temPapel(ctx, 'dono')
  const semTributo = new Decimal(premissas.aliquotaSobreRecebido).isZero()
  const custosZerados = premissas.custos.every((c) => c.valorCentavos === 0)

  return (
    <>
      <Link
        href={`/empreendimentos/${id}/viabilidade`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Viabilidade · {v.empreendimentos?.nome}
      </Link>
      <TituloPagina
        titulo={v.nome}
        subtitulo={
          v.situacao === 'aprovada'
            ? 'Plano vigente — congelado. Para mudar, crie um novo estudo e aprove como revisão.'
            : v.situacao === 'arquivada'
              ? 'Estudo arquivado (substituído por uma revisão do plano).'
              : 'Rascunho — valores em reais de hoje (base real).'
        }
      />

      {(semTributo || custosZerados) && v.situacao === 'rascunho' && (
        <Alerta tipo="aviso">
          {custosZerados && 'Preencha os custos do empreendimento. '}
          {semTributo && 'A alíquota de tributos está em 0%: confirme o valor com seu contador.'}
        </Alerta>
      )}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="TIR anual"
          valor={pct(r.tir.anual, 1)}
          nota={`${pct(r.tir.mensal)} ao mês`}
        />
        <Indicador
          rotulo={`VPL à TMA de ${pct(new Decimal(String(v.tma_mensal)))} a.m.`}
          valor={moeda(r.vpl)}
        />
        <Indicador
          rotulo="Exposição máxima de caixa"
          valor={moeda(r.exposicaoMaxima.valor)}
          nota={`no mês ${r.exposicaoMaxima.mes}`}
        />
        <Indicador
          rotulo="Payback simples / descontado"
          valor={`${r.paybackSimples ?? '—'} / ${r.paybackDescontado ?? '—'}`}
          nota="mês em que o caixa volta a ficar positivo"
        />
        <Indicador
          rotulo="VGV vendido (comercial)"
          valor={moeda(r.vgvVendido)}
          nota="não é caixa"
        />
        <Indicador
          rotulo="Total recebido"
          valor={moeda(r.recebido)}
          nota={`${moeda(r.receitaJuros)} de juros`}
        />
        <Indicador
          rotulo="Custos + tributos"
          valor={moeda(r.custos.plus(r.tributos))}
          nota={`${moeda(r.tributos)} de tributos`}
        />
        <Indicador
          rotulo="Lucro nominal"
          valor={moeda(r.lucroNominal)}
          nota={`margem de ${pct(r.margemSobreVgv, 1)} do VGV`}
        />
      </section>
      {r.tir.possivelTirMultipla && (
        <Alerta tipo="aviso">
          O fluxo troca de sinal mais de uma vez: pode haver mais de uma TIR. Avalie também pelo
          VPL.
        </Alerta>
      )}

      <Cartao>
        <GraficoCaixa
          acumulado={acumulado(r.fluxoMensal).map((c) => c.div(100).toNumber())}
          exposicaoMes={r.exposicaoMaxima.mes}
          paybackMes={r.paybackSimples}
        />
      </Cartao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Testes de estresse</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-normal">Cenário</th>
                <th className="py-2 text-right font-normal">TIR anual</th>
                <th className="py-2 text-right font-normal">Exposição</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t font-medium">
                <td className="py-2">Base</td>
                <td className="py-2 text-right">{pct(r.tir.anual, 1)}</td>
                <td className="py-2 text-right">{moeda(r.exposicaoMaxima.valor)}</td>
              </tr>
              {a.estresses.map((e) => (
                <tr key={e.nome} className="border-t">
                  <td className="py-2">{e.nome}</td>
                  <td className="py-2 text-right">{pct(e.resumo.tir.anual, 1)}</td>
                  <td className="py-2 text-right">{moeda(e.resumo.exposicaoMaxima.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>

        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Sensibilidade da TIR anual</h2>
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 text-left font-normal">Lotes/mês \ preço</th>
                  {a.sensibilidade.precos.map((f) => (
                    <th key={f} className="py-2 text-right font-normal">
                      {f === '1'
                        ? 'tabela'
                        : `${Number(f) < 1 ? '−' : '+'}${Math.round(Math.abs(Number(f) - 1) * 100)}%`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {a.sensibilidade.velocidades.map((vel, i) => (
                  <tr key={vel} className="border-t">
                    <th scope="row" className="py-2 text-left font-normal">
                      {vel}
                    </th>
                    {a.sensibilidade.tirAnual[i]!.map((t, j) => (
                      <td
                        key={j}
                        className={cn(
                          'py-2 text-right',
                          vel === premissas.vendas.lotesPorMes &&
                            a.sensibilidade.precos[j] === '1' &&
                            'font-semibold',
                        )}
                      >
                        {pct(t, 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Em negrito, o cenário base.</p>
        </Cartao>
      </div>

      {podeAprovar && !editar && (
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Aprovar plano</h2>
          <FormularioAprovar empreendimentoId={id} id={vid} revisao={(versoes ?? 0) > 0} />
        </Cartao>
      )}

      {podeEditar && (
        <Cartao className="flex flex-col gap-3">
          <details open={!!editar}>
            <summary className="cursor-pointer font-semibold">Premissas</summary>
            <div className="mt-4">
              <FormularioEstudo
                empreendimentoId={id}
                id={vid}
                inicial={valoresIniciais(v.nome, premissas, v.tma_mensal)}
              />
            </div>
          </details>
        </Cartao>
      )}
    </>
  )
}
