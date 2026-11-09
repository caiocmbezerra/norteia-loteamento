import { carregarPermutas } from '@norteia/aplicacao'
import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ConvitePortal } from '@/components/convite-portal'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import {
  FormularioEstornoRepasse,
  FormularioFinanceira,
  FormularioFisica,
  FormularioRepasse,
} from './formularios'

export const metadata: Metadata = { title: 'Permutas' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const BASES = {
  recebido: 'tudo o que é recebido',
  principal: 'amortização recebida',
  vgv: 'VGV (preço na venda)',
}

export default async function PaginaPermutas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador', 'engenharia', 'socio_leitura'))
    redirect(`/empreendimentos/${id}`)
  const { data: e } = await ctx.db
    .from('empreendimentos')
    .select('id, nome')
    .eq('id', id)
    .maybeSingle()
  if (!e) notFound()
  const hoje = hojeSaoPaulo()
  const podeEditar = temPapel(ctx, 'dono', 'financeiro')
  const [permutas, { data: lotes }] = await Promise.all([
    carregarPermutas(ctx.db, id, hoje),
    podeEditar
      ? ctx.db
          .from('lotes')
          .select('id, numero, quadras(codigo)')
          .eq('empreendimento_id', id)
          .eq('status', 'disponivel')
          .order('numero')
      : Promise.resolve({
          data: [] as { id: string; numero: string; quadras: { codigo: string } | null }[],
        }),
  ])
  const saldo = permutas.reduce((t, p) => t + (p.apuracao?.saldoCentavos ?? 0), 0)

  return (
    <>
      <Link
        href={`/empreendimentos/${id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← {e.nome}
      </Link>
      <TituloPagina
        titulo="Permutas"
        subtitulo="Lotes ou percentual entregues ao dono do terreno."
      />
      <section aria-label="Resumo das permutas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Lotes em permuta física"
          valor={String(permutas.reduce((t, p) => t + p.lotes.length, 0))}
        />
        <Indicador
          rotulo="Saldo a repassar"
          valor={moeda(saldo)}
          nota="permutas financeiras, até hoje"
        />
      </section>

      {permutas.map((p) => (
        <Cartao key={p.id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              {p.permutante} · permuta {p.tipo === 'fisica' ? 'física' : 'financeira'}
            </h2>
            <span className="text-sm text-muted-foreground">desde {formatarData(p.inicio)}</span>
          </div>
          {p.tipo === 'fisica' ? (
            <p className="text-sm">
              {p.lotes.join(', ')}
              {p.valorEconomicoCentavos ? (
                <span className="block text-xs text-muted-foreground">
                  Valor econômico {moeda(p.valorEconomicoCentavos)} — informação gerencial, não é
                  saída de caixa.
                </span>
              ) : null}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {formatarPercentual(p.percentual!, 2)} sobre {BASES[p.base!]}
                {p.abateDistrato ? '; distrato abate o repasse' : '; distrato não abate'}.
              </p>
              <section aria-label={`Extrato de ${p.permutante}`} className="grid grid-cols-3 gap-3">
                <Indicador rotulo="Devido" valor={moeda(p.apuracao!.devidoCentavos)} />
                <Indicador rotulo="Repassado" valor={moeda(p.apuracao!.pagoCentavos)} />
                <Indicador rotulo="Saldo" valor={moeda(p.apuracao!.saldoCentavos)} />
              </section>
              {p.apuracao!.linhas.length > 0 && (
                <div className="overflow-x-auto" tabIndex={0}>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 font-normal">Data</th>
                        <th className="py-1 font-normal">Origem</th>
                        <th className="py-1 text-right font-normal">Base</th>
                        <th className="py-1 text-right font-normal">Repasse</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.apuracao!.linhas.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="py-1">{formatarData(l.data)}</td>
                          <td className="py-1">{l.descricao}</td>
                          <td className="py-1 text-right">{moeda(l.baseCentavos)}</td>
                          <td className="py-1 text-right">{moeda(l.repasseCentavos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {p.repasses.length > 0 && (
                <ul className="divide-y text-sm">
                  {p.repasses.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <span className={r.estornado ? 'line-through' : undefined}>
                        Repasse em {formatarData(r.data)} · {moeda(r.valorCentavos)}
                        {r.observacao ? ` · ${r.observacao}` : ''}
                      </span>
                      {!r.estornado && podeEditar && (
                        <FormularioEstornoRepasse empreendimentoId={id} repasseId={r.id} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {podeEditar && p.situacao === 'vigente' && (
                <FormularioRepasse empreendimentoId={id} permutaId={p.id} hoje={hoje} />
              )}
            </>
          )}
          {podeEditar && p.permutantePortal && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">Portal do permutante</summary>
              <div className="mt-3">
                <ConvitePortal
                  tipo="permutante"
                  id={`convite-${p.id}`}
                  alvoId={p.permutantePortal.id}
                  email={p.permutantePortal.email}
                  ativo={p.permutantePortal.ativo}
                />
              </div>
            </details>
          )}
        </Cartao>
      ))}
      {permutas.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma permuta registrada.</p>
      )}

      {podeEditar && (
        <Cartao className="flex flex-col gap-3">
          <details>
            <summary className="cursor-pointer font-semibold">Nova permuta física (lotes)</summary>
            <div className="mt-3">
              <FormularioFisica
                empreendimentoId={id}
                hoje={hoje}
                lotes={(lotes ?? []).map((l) => ({
                  id: l.id,
                  rotulo: `Quadra ${l.quadras?.codigo ?? '?'} · Lote ${l.numero}`,
                }))}
              />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer font-semibold">
              Nova permuta financeira (percentual)
            </summary>
            <div className="mt-3">
              <FormularioFinanceira empreendimentoId={id} hoje={hoje} />
            </div>
          </details>
        </Cartao>
      )}
    </>
  )
}
