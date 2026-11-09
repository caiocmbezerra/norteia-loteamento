import { carregarPainelSpe } from '@norteia/aplicacao'
import { formatarData, formatarMoeda, formatarPercentual } from '@norteia/dominio'
import { arredondarCentavos } from '@norteia/motor-financeiro'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ConvitePortal } from '@/components/convite-portal'
import { Cartao, Indicador, TituloPagina } from '@/components/ui/cartao'
import { Alerta } from '@/components/ui/formulario'
import { exigirContexto, temPapel } from '@/lib/contexto'
import { hojeSaoPaulo } from '@/lib/datas'
import {
  FormularioEstornoMovimento,
  FormularioMovimento,
  FormularioParticipacao,
  FormularioSocio,
} from './formularios'

export const metadata: Metadata = { title: 'Sócios da SPE' }

const moeda = (c: number) => formatarMoeda(arredondarCentavos(String(c)))
const TIPOS = {
  aporte: 'Aporte',
  mutuo: 'Mútuo',
  devolucao_mutuo: 'Devolução de mútuo',
  distribuicao: 'Distribuição',
}

export default async function PaginaSpe({ params }: { params: Promise<{ speId: string }> }) {
  const { speId } = await params
  const ctx = await exigirContexto()
  if (!temPapel(ctx, 'dono', 'financeiro', 'contador', 'socio_leitura')) redirect('/painel')
  const hoje = hojeSaoPaulo()
  const p = await carregarPainelSpe(ctx.db, speId, hoje)
  if (!p) notFound()
  const podeEditar = temPapel(ctx, 'dono')

  return (
    <>
      <Link
        href="/configuracoes/empresas"
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Empresas e SPEs
      </Link>
      <TituloPagina
        titulo={p.razaoSocial}
        subtitulo="Sócios, participações, aportes, distribuições e resultado rateado."
        acoes={
          temPapel(ctx, 'dono', 'financeiro', 'contador') && (
            <>
              <Link
                href={`/spes/${speId}/contabil`}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                Contábil
              </Link>
              <Link
                href={`/spes/${speId}/dimob`}
                className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
              >
                DIMOB
              </Link>
            </>
          )
        }
      />
      <section aria-label="Resultado da SPE" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          rotulo="Resultado da SPE"
          valor={moeda(p.resultadoCentavos)}
          nota="fluxo atual dos empreendimentos (realizado + projetado)"
        />
        <Indicador rotulo="Sócios" valor={String(p.socios.length)} />
      </section>
      {p.semSocioCentavos !== 0 && (
        <Alerta tipo="aviso">
          {moeda(p.semSocioCentavos)} do resultado caem em períodos em que as participações somam
          menos de 100%.
        </Alerta>
      )}
      {p.empreendimentos.some((e) => !e.comPlano) && (
        <Alerta tipo="aviso">
          Empreendimentos sem plano aprovado ficam fora do resultado:{' '}
          {p.empreendimentos
            .filter((e) => !e.comPlano)
            .map((e) => e.nome)
            .join(', ')}
          .
        </Alerta>
      )}

      <Cartao className="flex flex-col gap-3">
        <h2 className="font-semibold">Por sócio</h2>
        {p.socios.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum sócio com participação ou movimento.
          </p>
        ) : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 font-normal">Sócio</th>
                  <th className="py-2 text-right font-normal">Participação hoje</th>
                  <th className="py-2 text-right font-normal">Aportes + mútuos</th>
                  <th className="py-2 text-right font-normal">Distribuições + devoluções</th>
                  <th className="py-2 text-right font-normal">Resultado rateado</th>
                  <th className="py-2 text-right font-normal">Retorno (a.a.)</th>
                </tr>
              </thead>
              <tbody>
                {p.socios.map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="py-2">{s.nome}</td>
                    <td className="py-2 text-right">
                      {s.participacaoHoje ? formatarPercentual(s.participacaoHoje, 2) : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {moeda(s.aportesCentavos + s.mutuosCentavos)}
                    </td>
                    <td className="py-2 text-right">
                      {moeda(s.distribuicoesCentavos + s.devolucoesMutuoCentavos)}
                    </td>
                    <td className="py-2 text-right">{moeda(s.resultadoCentavos)}</td>
                    <td className="py-2 text-right">
                      {s.tirAnual ? formatarPercentual(s.tirAnual, 1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Resultado rateado pela participação vigente em cada mês. Retorno calculado só sobre os
          movimentos já realizados.
        </p>
      </Cartao>

      <div className="grid gap-6 lg:grid-cols-2">
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Participações</h2>
          <ul className="divide-y text-sm">
            {p.participacoes.map((x) => (
              <li key={x.id} className="py-2">
                {x.socio}: {formatarPercentual(x.percentual, 2)} desde {formatarData(x.inicio)}
                {x.fim && ` até ${formatarData(x.fim)} (exclusive)`}
              </li>
            ))}
          </ul>
        </Cartao>
        <Cartao className="flex flex-col gap-3">
          <h2 className="font-semibold">Movimentos</h2>
          <ul className="divide-y text-sm">
            {p.movimentos.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className={m.estornado ? 'line-through' : undefined}>
                  {formatarData(m.data)} · {TIPOS[m.tipo]} · {m.socio} · {moeda(m.valorCentavos)}
                </span>
                {!m.estornado && podeEditar && (
                  <FormularioEstornoMovimento speId={speId} movimentoId={m.id} />
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      </div>

      {podeEditar && (
        <Cartao className="flex flex-col gap-3">
          <details>
            <summary className="cursor-pointer font-semibold">
              Registrar aporte, mútuo ou distribuição
            </summary>
            <div className="mt-3">
              <FormularioMovimento speId={speId} socios={p.todosSocios} hoje={hoje} />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer font-semibold">Definir participação</summary>
            <div className="mt-3">
              <FormularioParticipacao speId={speId} socios={p.todosSocios} hoje={hoje} />
            </div>
          </details>
          <details>
            <summary className="cursor-pointer font-semibold">Cadastrar sócio</summary>
            <div className="mt-3">
              <FormularioSocio speId={speId} />
            </div>
          </details>
          {p.todosSocios.length > 0 && (
            <details>
              <summary className="cursor-pointer font-semibold">Portal dos sócios</summary>
              <ul className="mt-3 flex flex-col divide-y">
                {p.todosSocios.map((s) => (
                  <li key={s.id} className="py-3">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">
                        {s.nome}
                        {s.noPortal ? ' · já acessa o portal' : ''}
                      </summary>
                      <div className="mt-3">
                        <ConvitePortal
                          tipo="socio"
                          id={`convite-${s.id}`}
                          alvoId={s.id}
                          email={s.email}
                          ativo={s.noPortal}
                        />
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Cartao>
      )}
    </>
  )
}
